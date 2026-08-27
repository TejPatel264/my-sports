/**
 * update-football-competition-api-football.js
 *
 * Shared logic for fetching competition data from api-football.com's direct
 * API (api-sports.io) - i.e. a key from signing up at api-football.com /
 * dashboard.api-football.com directly, NOT a RapidAPI marketplace key.
 * (api-football.com is also listed on RapidAPI as a separate product with
 * its own key format and its own gateway host - the two aren't
 * interchangeable, and mixing them up is what "API doesn't exists" means.)
 * Parallel to update-football-competition.js (which uses football-data.org).
 *
 * Each competition script (update-carabao-cup.js, etc.) supplies config
 * (league ID, data file, team-name mapping, season window) and calls runUpdate().
 * The actual fetch/parse/match/write logic lives here once.
 *
 * No database, no server. Just fetch + diff against JSON, run from GitHub Action.
 */

const fs = require("fs");
const path = require("path");

const API_BASE = "https://v3.football.api-sports.io";

function formatResult(goals) {
  if (goals?.home == null || goals?.away == null) return null;
  return `${goals.home}-${goals.away}`;
}

async function fetchCompetitionFixtures(leagueId, season, apiKey) {
  const res = await fetch(
    `${API_BASE}/fixtures?league=${leagueId}&season=${season}`,
    {
      headers: {
        "x-apisports-key": apiKey,
      },
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `api-football.com request failed: ${res.status} ${res.statusText}\n${body}`
    );
  }

  const data = await res.json();
  if (!Array.isArray(data.response)) {
    throw new Error(
      "Unexpected response shape from api-football.com: no 'response' array"
    );
  }
  return data.response;
}

function loadExistingEvents(dataFile) {
  if (!fs.existsSync(dataFile)) return [];
  const raw = fs.readFileSync(dataFile, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed))
    throw new Error(`${dataFile} does not contain a JSON array`);
  return parsed;
}

function nextEventId(existingEvents, idPrefix) {
  const pattern = new RegExp(`^${idPrefix}_(\\d+)$`);
  let max = 0;
  existingEvents.forEach((e) => {
    const m = pattern.exec(e.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return () => `${idPrefix}_${String(++max).padStart(3, "0")}`;
}

/**
 * config = {
 *   leagueId,             // api-football.com league ID, e.g. 81 (Carabao Cup)
 *   season,               // Season year, e.g. 2026
 *   competitionId,        // this app's competition id, e.g. "carabao_cup"
 *   idPrefix,             // e.g. "evt_carabao"
 *   dataFile,             // absolute path to the data/*.json file
 *   teamNameToId,         // { "Arsenal": "team_arsenal", ... }
 *   seasonWindows,        // [{ seasonId, start: ISO, end: ISO }, ...]
 *   stripSuffixPattern,   // RegExp to strip from team names, e.g. / FC$| AFC$/
 * }
 */
function makeToAppEvent(config) {
  function teamIdFor(apiTeamName) {
    const id = config.teamNameToId[apiTeamName];
    if (!id) {
      throw new Error(
        `Unrecognized team name from api-football.com: "${apiTeamName}". ` +
          `Add it to the team-name mapping for this competition.`
      );
    }
    return id;
  }

  function seasonIdForDate(isoDate) {
    const d = new Date(isoDate);
    const window = config.seasonWindows.find(
      (w) => d >= new Date(w.start) && d < new Date(w.end)
    );
    return window ? window.seasonId : null;
  }

  return function toAppEvent(apiFixture) {
    const homeId = teamIdFor(apiFixture.teams.home.name);
    const awayId = teamIdFor(apiFixture.teams.away.name);
    const seasonId = seasonIdForDate(apiFixture.fixture.date);

    if (!seasonId) {
      console.warn(
        `Skipping fixture ${apiFixture.fixture.id} (${apiFixture.fixture.date}) - outside the season window(s) this script handles.`
      );
      return null;
    }

    const stripPattern = config.stripSuffixPattern || / FC$| AFC$/;
    return {
      sportId: "football",
      competitionId: config.competitionId,
      seasonId,
      date: apiFixture.fixture.date,
      title: `${apiFixture.teams.home.name.replace(stripPattern, "")} vs ${apiFixture.teams.away.name.replace(stripPattern, "")}`,
      participants: [homeId, awayId],
      sportData: {
        kind: "football_match",
        homeTeam: homeId,
        awayTeam: awayId,
        venue: apiFixture.fixture.venue?.name || null,
        result: formatResult(apiFixture.goals),
      },
      dataQuality: "verified",
      externalIds: { apiFootballId: apiFixture.fixture.id },
    };
  };
}

function reconcile(existingEvents, apiFixtures, config) {
  const toAppEvent = makeToAppEvent(config);

  const byApiId = new Map();
  const byTeamsAndDate = new Map();
  const teamsDateKey = (participants, isoDate) => {
    const sortedTeams = [...participants].sort().join("|");
    const day = isoDate.slice(0, 10); // YYYY-MM-DD
    return `${sortedTeams}__${day}`;
  };

  existingEvents.forEach((e) => {
    const apiId = e.externalIds?.apiFootballId;
    if (apiId != null) byApiId.set(apiId, e);
    else byTeamsAndDate.set(teamsDateKey(e.participants, e.date), e);
  });

  const genId = nextEventId(existingEvents, config.idPrefix);
  const updated = [...existingEvents];
  let addedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;
  let backfilledCount = 0;

  for (const apiFixture of apiFixtures) {
    let appEvent;
    try {
      appEvent = toAppEvent(apiFixture);
    } catch (err) {
      console.error(`  ! ${err.message}`);
      skippedCount++;
      continue;
    }
    if (!appEvent) {
      skippedCount++;
      continue;
    }

    let existing = byApiId.get(apiFixture.fixture.id);
    let matchedByFallback = false;
    if (!existing) {
      existing = byTeamsAndDate.get(
        teamsDateKey(appEvent.participants, appEvent.date)
      );
      matchedByFallback = !!existing;
    }

    if (existing) {
      const changed =
        existing.date !== appEvent.date ||
        existing.sportData.venue !== appEvent.sportData.venue ||
        existing.sportData.result !== appEvent.sportData.result ||
        existing.externalIds?.apiFootballId == null;

      if (changed) {
        existing.date = appEvent.date;
        existing.sportData.venue = appEvent.sportData.venue;
        existing.sportData.result = appEvent.sportData.result;
        if (existing.externalIds?.apiFootballId == null) {
          existing.externalIds = {
            ...(existing.externalIds || {}),
            apiFootballId: apiFixture.fixture.id,
          };
          backfilledCount++;
        }
        updatedCount++;
        console.log(
          `  ~ ${matchedByFallback ? "matched existing + updated" : "updated"}: ${appEvent.title} (${appEvent.date})`
        );
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
    console.log(
      `  (backfilled apiFootballId on ${backfilledCount} pre-existing event(s) matched by team+date)`
    );
  }

  return { events: updated, addedCount, updatedCount, unchangedCount, skippedCount };
}

async function runUpdate(config) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    console.error("Missing API_FOOTBALL_KEY environment variable.");
    console.error(
      "Get a free key at https://dashboard.api-football.com/register and set it locally or as a GitHub Actions secret. " +
      "(This must be a direct api-football.com key, not a RapidAPI key - the two use different hosts/auth and aren't interchangeable.)"
    );
    process.exit(1);
  }

  console.log(
    `Fetching ${config.competitionId.toUpperCase()} fixtures from api-football.com (league ${config.leagueId}, season ${config.season})...`
  );
  const apiFixtures = await fetchCompetitionFixtures(
    config.leagueId,
    config.season,
    apiKey
  );
  console.log(`  received ${apiFixtures.length} fixtures`);

  const existingEvents = loadExistingEvents(config.dataFile);
  console.log(`Existing events on file: ${existingEvents.length}`);

  console.log(`Reconciling...`);
  const result = reconcile(existingEvents, apiFixtures, config);

  console.log("");
  console.log(`Added:     ${result.addedCount}`);
  console.log(`Updated:   ${result.updatedCount}`);
  console.log(`Unchanged: ${result.unchangedCount}`);
  console.log(`Skipped:   ${result.skippedCount}`);

  if (result.addedCount === 0 && result.updatedCount === 0) {
    console.log("");
    console.log(
      `No changes - leaving ${path.basename(config.dataFile)} untouched.`
    );
    return result;
  }

  result.events.sort((a, b) => new Date(a.date) - new Date(b.date));

  fs.writeFileSync(config.dataFile, JSON.stringify(result.events, null, 2) + "\n");
  console.log("");
  console.log(
    `Wrote ${result.events.length} events to ${path.relative(process.cwd(), config.dataFile)}`
  );
  return result;
}

module.exports = { runUpdate, reconcile, fetchCompetitionFixtures, loadExistingEvents };
