/**
 * tennis-common.js
 *
 * Shared logic for pulling ATP/WTA match data from stats.tennismylife.org.
 * That site publishes a documented bulk-download API
 * (GET /api/data-files -> { files: [{ name, url }, ...] }) specifically for
 * automated/scripted consumption - see their own copy-paste curl/PowerShell
 * examples on https://stats.tennismylife.org/tennis-match-database - and
 * states the database is MIT-licensed and free to use. No API key needed.
 *
 * Unlike Cricsheet, this is plain CSV (one row per completed match, already
 * fairly minimal - no ball-by-ball equivalent to filter out), so there's
 * less to strip here; the main job is turning each row into an app event and
 * auto-registering any new player/tournament/season encountered.
 *
 * IMPORTANT CAVEAT: this dataset only records each match's TOURNAMENT week
 * (`tourney_date`), not the specific day the individual match was played.
 * Every match in the same tournament shares the same `date` here - there's
 * no per-match day/time available in the source data.
 */

const fs = require("fs");

const DATA_FILES_API = "https://stats.tennismylife.org/api/data-files";

function slug(s) {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// Minimal CSV parser (no dependency) - handles quoted fields defensively,
// even though this source's fields haven't needed it in practice.
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] !== undefined ? cells[i] : ""; });
    return row;
  });
}

function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cells.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

async function fetchDataFileList() {
  const res = await fetch(DATA_FILES_API);
  if (!res.ok) throw new Error(`Failed to fetch ${DATA_FILES_API}: ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (!Array.isArray(data.files)) throw new Error("Unexpected response shape from data-files API: no 'files' array");
  return data.files; // [{ name, url, ... }]
}

async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return parseCsv(await res.text());
}

// Turns one CSV row into an app event. `tour` is "atp" or "wta". Each
// tournament becomes its own competition (matching how every other sport in
// this app treats leagues/tournaments), with each year of it a season -
// same two-level model as everything else, just auto-populated instead of
// hand-listed, since there are hundreds of distinct tournament names.
function toAppEvent(row, tour) {
  if (!row.winner_name || !row.loser_name || !row.tourney_date || row.tourney_date.length !== 8) {
    return null; // malformed row - skip rather than crash the whole run
  }

  const winnerId = `tennis_player_${tour}_${row.winner_id}`;
  const loserId = `tennis_player_${tour}_${row.loser_id}`;
  const year = row.tourney_date.slice(0, 4);
  const competitionId = `tennis_${tour}_${slug(row.tourney_name)}`;
  const seasonId = `${competitionId}_${year}`;
  const isoDate = `${year}-${row.tourney_date.slice(4, 6)}-${row.tourney_date.slice(6, 8)}T00:00:00Z`;

  return {
    sportId: "tennis",
    competitionId,
    seasonId,
    date: isoDate,
    title: `${row.winner_name} vs ${row.loser_name}`,
    participants: [winnerId, loserId],
    sportData: {
      kind: "tennis_match",
      round: row.round || null,
      surface: row.surface || null,
      tournamentLevel: row.tourney_level || null,
      winner: winnerId,
      loser: loserId,
      score: row.score || null,
      durationMinutes: row.minutes && !Number.isNaN(Number(row.minutes)) ? Number(row.minutes) : null,
    },
    dataQuality: "verified",
    externalIds: { tmlMatchId: `${tour}_${row.tourney_id}_${row.match_num}` },
    // Kept for registry building, not stored on the final event:
    __winnerName: row.winner_name,
    __loserName: row.loser_name,
    __tourneyName: row.tourney_name,
  };
}

function loadJsonArrayFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${filePath} does not contain a JSON array`);
  return parsed;
}

function nextEventId(existingEvents, idPrefix) {
  const pattern = new RegExp(`^${idPrefix}_(\\d+)$`);
  let max = 0;
  existingEvents.forEach(e => {
    const m = pattern.exec(e.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return () => `${idPrefix}_${String(++max).padStart(6, "0")}`;
}

function updatePlayerRegistry(playersFile, playersSeen) {
  const existing = loadJsonArrayFile(playersFile);
  const existingIds = new Set(existing.map(p => p.id));
  let added = 0;
  playersSeen.forEach(({ id, name }) => {
    if (!existingIds.has(id)) {
      existing.push({ id, sportId: "tennis", name });
      existingIds.add(id);
      added++;
    }
  });
  if (added > 0) {
    existing.sort((a, b) => a.name.localeCompare(b.name));
    fs.writeFileSync(playersFile, JSON.stringify(existing, null, 2) + "\n");
  }
  return added;
}

function updateCompetitionRegistry(competitionsFile, competitionsSeen) {
  const existing = loadJsonArrayFile(competitionsFile);
  const existingIds = new Set(existing.map(c => c.id));
  let added = 0;
  competitionsSeen.forEach(({ id, name, shortName }) => {
    if (!existingIds.has(id)) {
      existing.push({ id, sportId: "tennis", name, shortName });
      existingIds.add(id);
      added++;
    }
  });
  if (added > 0) {
    existing.sort((a, b) => a.name.localeCompare(b.name));
    fs.writeFileSync(competitionsFile, JSON.stringify(existing, null, 2) + "\n");
  }
  return added;
}

function updateSeasonRegistry(seasonsFile, seasonsSeen) {
  const existing = loadJsonArrayFile(seasonsFile);
  const existingIds = new Set(existing.map(s => s.id));
  let added = 0;
  seasonsSeen.forEach(({ id, competitionId, label }) => {
    if (!existingIds.has(id)) {
      existing.push({ id, competitionId, label });
      existingIds.add(id);
      added++;
    }
  });
  if (added > 0) {
    existing.sort((a, b) => a.id.localeCompare(b.id));
    fs.writeFileSync(seasonsFile, JSON.stringify(existing, null, 2) + "\n");
  }
  return added;
}

/**
 * Runs one tour's set of yearly CSVs (plus its "ongoing" file, which is how
 * in-progress tournaments show up before their file gets folded into the
 * next yearly file) through the pipeline: discover files via the API, fetch
 * each, filter to years >= minYear, reconcile against a shared
 * data/tennis-events.json, and update the player/competition/season
 * registries with anything new.
 */
async function runTennisTour(tour, { minYear, eventsFile, playersFile, competitionsFile, seasonsFile }) {
  const label = tour === "atp" ? "ATP Tour" : "WTA Tour";
  console.log(`\n=== ${label} ===`);

  const allFiles = await fetchDataFileList();
  const yearlyPattern = tour === "atp" ? /^(\d{4})\.csv$/ : /^(\d{4})_wta\.csv$/;
  const ongoingName = tour === "atp" ? "ongoing_tourneys.csv" : "wta_ongoing_tourneys.csv";

  const filesToFetch = allFiles.filter(f => {
    if (f.name === ongoingName) return true;
    const m = yearlyPattern.exec(f.name);
    return m && parseInt(m[1], 10) >= minYear;
  });
  console.log(`  Fetching ${filesToFetch.length} file(s): ${filesToFetch.map(f => f.name).join(", ")}`);

  const existingEvents = loadJsonArrayFile(eventsFile);
  const byMatchId = new Map();
  existingEvents.forEach(e => {
    if (e.externalIds?.tmlMatchId) byMatchId.set(e.externalIds.tmlMatchId, e);
  });

  const genId = nextEventId(existingEvents, "evt_tennis");
  const playersSeen = new Map();
  const competitionsSeen = new Map();
  const seasonsSeen = new Map();
  let added = 0, updated = 0, unchanged = 0, skipped = 0;
  const updatedEvents = [...existingEvents];

  for (const file of filesToFetch) {
    let rows;
    try {
      rows = await fetchCsv(file.url);
    } catch (err) {
      console.error(`  ! Failed to fetch/parse ${file.name}: ${err.message}`);
      continue;
    }

    for (const row of rows) {
      const appEvent = toAppEvent(row, tour);
      if (!appEvent) { skipped++; continue; }

      playersSeen.set(appEvent.sportData.winner, appEvent.__winnerName);
      playersSeen.set(appEvent.sportData.loser, appEvent.__loserName);
      competitionsSeen.set(appEvent.competitionId, {
        id: appEvent.competitionId,
        name: `${appEvent.__tourneyName} (${tour.toUpperCase()})`,
        shortName: appEvent.__tourneyName,
      });
      seasonsSeen.set(appEvent.seasonId, {
        competitionId: appEvent.competitionId,
        label: appEvent.date.slice(0, 4),
      });
      delete appEvent.__winnerName;
      delete appEvent.__loserName;
      delete appEvent.__tourneyName;

      const matchId = appEvent.externalIds.tmlMatchId;
      const existing = byMatchId.get(matchId);
      if (existing) {
        const changed = existing.sportData.score !== appEvent.sportData.score
          || existing.sportData.round !== appEvent.sportData.round;
        if (changed) {
          existing.sportData = appEvent.sportData;
          existing.title = appEvent.title;
          updated++;
        } else {
          unchanged++;
        }
      } else {
        appEvent.id = genId();
        updatedEvents.push(appEvent);
        byMatchId.set(matchId, appEvent);
        added++;
      }
    }
  }

  console.log(`  Added: ${added}  Updated: ${updated}  Unchanged: ${unchanged}  Skipped: ${skipped}`);

  const playersAdded = updatePlayerRegistry(playersFile, [...playersSeen.entries()].map(([id, name]) => ({ id, name })));
  const competitionsAdded = updateCompetitionRegistry(competitionsFile, [...competitionsSeen.values()]);
  const seasonsAdded = updateSeasonRegistry(seasonsFile, [...seasonsSeen.entries()].map(([id, v]) => ({ id, ...v })));
  if (playersAdded) console.log(`  New players added to registry: ${playersAdded}`);
  if (competitionsAdded) console.log(`  New competitions added to registry: ${competitionsAdded}`);
  if (seasonsAdded) console.log(`  New seasons added to registry: ${seasonsAdded}`);

  if (added || updated) {
    updatedEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(eventsFile, JSON.stringify(updatedEvents, null, 2) + "\n");
  }

  return { added, updated, unchanged, skipped, playersAdded, competitionsAdded, seasonsAdded };
}

module.exports = { runTennisTour, slug, parseCsv };
