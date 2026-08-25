#!/usr/bin/env node
/**
 * update-epl.js
 *
 * MVP for one source, one competition, as scoped:
 *   1. Fetch Premier League matches from football-data.org (free tier).
 *   2. Parse into the app's event shape.
 *   3. Match against existing records in data/epl-events.json.
 *   4. Add new events, update changed ones (date moves, results coming in).
 *   5. Write the file back.
 *
 * Run locally:
 *   FOOTBALL_DATA_API_KEY=xxxx node scripts/update-epl.js
 *
 * No paid API, no server, no database, no LLM calls. Just a fetch + a diff
 * against a JSON file, meant to run from a scheduled GitHub Action.
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "epl-events.json");
const API_BASE = "https://api.football-data.org/v4";
const COMPETITION_CODE = "PL";

// football-data.org team names -> this app's existing team IDs (team_<slug>).
// Explicit mapping rather than fuzzy string matching: there are only 20 PL
// teams, the source's naming is stable, and an explicit table fails loudly
// (a team you've never seen) rather than silently (a bad fuzzy match).
const TEAM_NAME_TO_ID = {
  "Arsenal FC": "team_arsenal",
  "Aston Villa FC": "team_aston_villa",
  "Brentford FC": "team_brentford",
  "Brighton & Hove Albion FC": "team_brighton_and_hove_albion",
  "Chelsea FC": "team_chelsea",
  "Crystal Palace FC": "team_crystal_palace",
  "Everton FC": "team_everton",
  "Fulham FC": "team_fulham",
  "Leeds United FC": "team_leeds_united",
  "Liverpool FC": "team_liverpool",
  "Manchester City FC": "team_manchester_city",
  "Manchester United FC": "team_manchester_united",
  "Newcastle United FC": "team_newcastle_united",
  "Nottingham Forest FC": "team_nottingham_forest",
  "Sunderland AFC": "team_sunderland",
  "Tottenham Hotspur FC": "team_tottenham_hotspur",
  "AFC Bournemouth": "team_afc_bournemouth",
  "Hull City AFC": "team_hull_city",
  "Coventry City FC": "team_coventry_city",
  "Ipswich Town FC": "team_ipswich_town",
};

function teamIdFor(fdName) {
  const id = TEAM_NAME_TO_ID[fdName];
  if (!id) {
    throw new Error(
      `Unrecognized team name from football-data.org: "${fdName}". ` +
      `Add it to TEAM_NAME_TO_ID in scripts/update-epl.js (check for promoted/relegated clubs or a naming change).`
    );
  }
  return id;
}

function seasonIdForDate(isoDate) {
  // 2026/27 Premier League season runs Aug 2026 - May 2027. This script is
  // scoped to the current season only for the MVP; a fixture outside that
  // window is flagged rather than silently misfiled into the wrong season.
  const d = new Date(isoDate);
  const seasonStart = new Date("2026-07-01T00:00:00Z");
  const seasonEnd = new Date("2027-07-01T00:00:00Z");
  if (d >= seasonStart && d < seasonEnd) return "epl_2026_27";
  return null;
}

function formatResult(score) {
  if (score?.fullTime?.home == null || score?.fullTime?.away == null) return null;
  return `${score.fullTime.home}-${score.fullTime.away}`;
}

// Converts one football-data.org match object into this app's event shape.
function toAppEvent(fdMatch, existingIdCounter) {
  const homeId = teamIdFor(fdMatch.homeTeam.name);
  const awayId = teamIdFor(fdMatch.awayTeam.name);
  const seasonId = seasonIdForDate(fdMatch.utcDate);

  if (!seasonId) {
    console.warn(`Skipping match ${fdMatch.id} (${fdMatch.utcDate}) - outside the 2026/27 season window this script handles.`);
    return null;
  }

  return {
    // id assigned by caller once we know if this is new or an update
    sportId: "football",
    competitionId: "epl",
    seasonId,
    date: fdMatch.utcDate,
    title: `${fdMatch.homeTeam.name.replace(/ FC$| AFC$/, "")} vs ${fdMatch.awayTeam.name.replace(/ FC$| AFC$/, "")}`,
    participants: [homeId, awayId],
    sportData: {
      kind: "football_match",
      homeTeam: homeId,
      awayTeam: awayId,
      venue: fdMatch.venue || null,
      result: formatResult(fdMatch.score),
    },
    dataQuality: "verified",
    externalIds: { footballDataOrgId: fdMatch.id },
  };
}

async function fetchPremierLeagueMatches(apiKey) {
  const res = await fetch(`${API_BASE}/competitions/${COMPETITION_CODE}/matches`, {
    headers: { "X-Auth-Token": apiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`football-data.org request failed: ${res.status} ${res.statusText}\n${body}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.matches)) {
    throw new Error("Unexpected response shape from football-data.org: no 'matches' array");
  }
  return data.matches;
}

function loadExistingEvents() {
  if (!fs.existsSync(DATA_FILE)) return [];
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

function nextEventId(existingEvents) {
  // "evt_epl_NNN" namespace, distinct from the inline seed data's "evt_NNN"
  // counter (F1/darts/cricket etc, still defined in index.html) so IDs can
  // never collide across the two sources when the app merges them at
  // runtime. This was the cause of a real bug once already - IndexedDB
  // enforces primary-key uniqueness, so any collision here silently breaks
  // the entire seeding step and the app never finishes loading.
  let max = 0;
  existingEvents.forEach(e => {
    const m = /^evt_epl_(\d+)$/.exec(e.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return () => `evt_epl_${String(++max).padStart(3, "0")}`;
}

function reconcile(existingEvents, fdMatches) {
  const byFdId = new Map();
  // Secondary lookup for events that predate this script (seeded manually,
  // no footballDataOrgId yet): match on same two participants + same
  // calendar date. This only matters for the first run against
  // already-existing data; after that, every event carries its
  // footballDataOrgId and this fallback is never needed.
  const byTeamsAndDate = new Map();
  const teamsDateKey = (participants, isoDate) => {
    const sortedTeams = [...participants].sort().join("|");
    const day = isoDate.slice(0, 10); // YYYY-MM-DD - tolerate same-day ko-time corrections
    return `${sortedTeams}__${day}`;
  };

  existingEvents.forEach(e => {
    const fdId = e.externalIds?.footballDataOrgId;
    if (fdId != null) byFdId.set(fdId, e);
    else byTeamsAndDate.set(teamsDateKey(e.participants, e.date), e);
  });

  const genId = nextEventId(existingEvents);
  const updated = [...existingEvents];
  let addedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;
  let backfilledCount = 0;

  for (const fdMatch of fdMatches) {
    let appEvent;
    try {
      appEvent = toAppEvent(fdMatch);
    } catch (err) {
      console.error(`  ! ${err.message}`);
      skippedCount++;
      continue;
    }
    if (!appEvent) { skippedCount++; continue; }

    let existing = byFdId.get(fdMatch.id);
    let matchedByFallback = false;
    if (!existing) {
      existing = byTeamsAndDate.get(teamsDateKey(appEvent.participants, appEvent.date));
      matchedByFallback = !!existing;
    }

    if (existing) {
      // Comparing only the fields that can legitimately change (date moves
      // for TV, venue confirmed, result comes in) - id/participants/
      // competition are stable once matched.
      const changed =
        existing.date !== appEvent.date ||
        existing.sportData.venue !== appEvent.sportData.venue ||
        existing.sportData.result !== appEvent.sportData.result ||
        existing.externalIds?.footballDataOrgId == null;

      if (changed) {
        existing.date = appEvent.date;
        existing.sportData.venue = appEvent.sportData.venue;
        existing.sportData.result = appEvent.sportData.result;
        if (existing.externalIds?.footballDataOrgId == null) {
          existing.externalIds = { ...(existing.externalIds || {}), footballDataOrgId: fdMatch.id };
          backfilledCount++;
        }
        updatedCount++;
        console.log(`  ~ ${matchedByFallback ? "matched existing + updated" : "updated"}: ${appEvent.title} (${appEvent.date})`);
      } else {
        unchangedCount++;
      }
    } else {
      appEvent.id = genId();
      updated.push(appEvent);
      addedCount++;
      console.log(`  + added: ${appEvent.title} (${appEvent.date})`);
    }
  }

  if (backfilledCount) {
    console.log(`  (backfilled footballDataOrgId on ${backfilledCount} pre-existing event(s) matched by team+date)`);
  }

  return { events: updated, addedCount, updatedCount, unchangedCount, skippedCount };
}

async function main() {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    console.error("Missing FOOTBALL_DATA_API_KEY environment variable.");
    console.error("Get a free key at https://www.football-data.org/client/register and set it locally or as a GitHub Actions secret.");
    process.exit(1);
  }

  console.log(`Fetching Premier League matches from football-data.org...`);
  const fdMatches = await fetchPremierLeagueMatches(apiKey);
  console.log(`  received ${fdMatches.length} matches`);

  const existingEvents = loadExistingEvents();
  console.log(`Existing EPL events on file: ${existingEvents.length}`);

  console.log(`Reconciling...`);
  const result = reconcile(existingEvents, fdMatches);

  console.log("");
  console.log(`Added:     ${result.addedCount}`);
  console.log(`Updated:   ${result.updatedCount}`);
  console.log(`Unchanged: ${result.unchangedCount}`);
  console.log(`Skipped:   ${result.skippedCount}`);

  if (result.addedCount === 0 && result.updatedCount === 0) {
    console.log("");
    console.log("No changes - leaving data/epl-events.json untouched.");
    return;
  }

  // Sort by date for a stable, readable diff in version control.
  result.events.sort((a, b) => new Date(a.date) - new Date(b.date));

  fs.writeFileSync(DATA_FILE, JSON.stringify(result.events, null, 2) + "\n");
  console.log("");
  console.log(`Wrote ${result.events.length} events to ${path.relative(process.cwd(), DATA_FILE)}`);
}

main().catch(err => {
  console.error("update-epl.js failed:");
  console.error(err);
  process.exit(1);
});
