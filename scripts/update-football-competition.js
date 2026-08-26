/**
 * update-football-competition.js
 *
 * Shared logic behind the per-competition update scripts (update-epl.js,
 * update-championship.js, and any future one). Each of those just supplies
 * config (competition code, data file, team-name mapping, season window)
 * and calls runUpdate() - the actual fetch/parse/match/write logic lives
 * here once, so it can't drift between competitions.
 *
 * No paid API, no server, no database, no LLM calls. Just a fetch + a diff
 * against a JSON file, meant to run from a scheduled GitHub Action.
 */

const fs = require("fs");
const path = require("path");

const API_BASE = "https://api.football-data.org/v4";

function formatResult(score) {
  if (score?.fullTime?.home == null || score?.fullTime?.away == null) return null;
  return `${score.fullTime.home}-${score.fullTime.away}`;
}

async function fetchCompetitionMatches(competitionCode, apiKey) {
  const res = await fetch(`${API_BASE}/competitions/${competitionCode}/matches`, {
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

function loadExistingEvents(dataFile) {
  if (!fs.existsSync(dataFile)) return [];
  const raw = fs.readFileSync(dataFile, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${dataFile} does not contain a JSON array`);
  return parsed;
}

// idPrefix e.g. "evt_epl" / "evt_championship" - keeps every competition's
// generated IDs in their own numbering namespace, distinct from each other
// and from the inline seed data's "evt_NNN" counter in index.html. IDs
// colliding across sources broke the whole app once already (IndexedDB
// enforces unique primary keys, so a collision fails the entire seed step
// silently) - this is the fix, applied consistently for every competition.
function nextEventId(existingEvents, idPrefix) {
  const pattern = new RegExp(`^${idPrefix}_(\\d+)$`);
  let max = 0;
  existingEvents.forEach(e => {
    const m = pattern.exec(e.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return () => `${idPrefix}_${String(++max).padStart(3, "0")}`;
}

/**
 * config = {
 *   competitionCode,      // football-data.org code, e.g. "PL", "ELC"
 *   competitionId,        // this app's competition id, e.g. "epl", "championship"
 *   idPrefix,             // e.g. "evt_epl", "evt_championship"
 *   dataFile,             // absolute path to the data/*.json file
 *   teamNameToId,         // { "Arsenal FC": "team_arsenal", ... }
 *   seasonWindows,        // [{ seasonId, start: ISO, end: ISO }, ...]
 *   stripSuffixPattern,   // RegExp to strip from fd names for the display title, e.g. / FC$| AFC$/
 * }
 */
function makeToAppEvent(config) {
  function teamIdFor(fdName) {
    const id = config.teamNameToId[fdName];
    if (!id) {
      throw new Error(
        `Unrecognized team name from football-data.org: "${fdName}". ` +
        `Add it to the team-name mapping for this competition (check for promoted/relegated clubs or a naming change).`
      );
    }
    return id;
  }

  function seasonIdForDate(isoDate) {
    const d = new Date(isoDate);
    const window = config.seasonWindows.find(w => d >= new Date(w.start) && d < new Date(w.end));
    return window ? window.seasonId : null;
  }

  return function toAppEvent(fdMatch) {
    const homeId = teamIdFor(fdMatch.homeTeam.name);
    const awayId = teamIdFor(fdMatch.awayTeam.name);
    const seasonId = seasonIdForDate(fdMatch.utcDate);

    if (!seasonId) {
      console.warn(`Skipping match ${fdMatch.id} (${fdMatch.utcDate}) - outside the season window(s) this script handles.`);
      return null;
    }

    const stripPattern = config.stripSuffixPattern || / FC$| AFC$/;
    return {
      sportId: "football",
      competitionId: config.competitionId,
      seasonId,
      date: fdMatch.utcDate,
      title: `${fdMatch.homeTeam.name.replace(stripPattern, "")} vs ${fdMatch.awayTeam.name.replace(stripPattern, "")}`,
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
  };
}

function reconcile(existingEvents, fdMatches, config) {
  const toAppEvent = makeToAppEvent(config);

  const byFdId = new Map();
  // Secondary lookup for events that predate this script (seeded manually
  // or otherwise carrying no footballDataOrgId yet): match on same two
  // participants + same calendar date. Matters mainly on a first run
  // against pre-existing data; after that every event carries its
  // footballDataOrgId and this fallback is never needed. For a
  // brand-new/empty data file (nothing pre-existing), this map is simply
  // empty and every match is added fresh.
  const byTeamsAndDate = new Map();
  const teamsDateKey = (participants, isoDate) => {
    const sortedTeams = [...participants].sort().join("|");
    const day = isoDate.slice(0, 10); // YYYY-MM-DD - tolerate same-day kickoff-time corrections
    return `${sortedTeams}__${day}`;
  };

  existingEvents.forEach(e => {
    const fdId = e.externalIds?.footballDataOrgId;
    if (fdId != null) byFdId.set(fdId, e);
    else byTeamsAndDate.set(teamsDateKey(e.participants, e.date), e);
  });

  const genId = nextEventId(existingEvents, config.idPrefix);
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

async function runUpdate(config) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    console.error("Missing FOOTBALL_DATA_API_KEY environment variable.");
    console.error("Get a free key at https://www.football-data.org/client/register and set it locally or as a GitHub Actions secret.");
    process.exit(1);
  }

  console.log(`Fetching ${config.competitionId.toUpperCase()} matches from football-data.org (${config.competitionCode})...`);
  const fdMatches = await fetchCompetitionMatches(config.competitionCode, apiKey);
  console.log(`  received ${fdMatches.length} matches`);

  const existingEvents = loadExistingEvents(config.dataFile);
  console.log(`Existing events on file: ${existingEvents.length}`);

  console.log(`Reconciling...`);
  const result = reconcile(existingEvents, fdMatches, config);

  console.log("");
  console.log(`Added:     ${result.addedCount}`);
  console.log(`Updated:   ${result.updatedCount}`);
  console.log(`Unchanged: ${result.unchangedCount}`);
  console.log(`Skipped:   ${result.skippedCount}`);

  if (result.addedCount === 0 && result.updatedCount === 0) {
    console.log("");
    console.log(`No changes - leaving ${path.basename(config.dataFile)} untouched.`);
    return result;
  }

  result.events.sort((a, b) => new Date(a.date) - new Date(b.date));

  fs.writeFileSync(config.dataFile, JSON.stringify(result.events, null, 2) + "\n");
  console.log("");
  console.log(`Wrote ${result.events.length} events to ${path.relative(process.cwd(), config.dataFile)}`);
  return result;
}

module.exports = { runUpdate, reconcile, fetchCompetitionMatches, loadExistingEvents };
