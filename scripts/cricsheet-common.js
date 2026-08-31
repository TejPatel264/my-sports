/**
 * cricsheet-common.js
 *
 * Shared logic for pulling match data from cricsheet.org. Cricsheet ships
 * whole-competition zip files (JSON, one file per match, versioned schema at
 * https://cricsheet.org/format/json/), so the shape of this pipeline is a bit
 * different from the football scrapers: there's no per-request API call,
 * instead each run downloads a zip, extracts it, and processes every match
 * file inside.
 *
 * Cricsheet's ball-by-ball delivery data (the bulk of each file, and not
 * needed for a "did I watch this" log) is discarded entirely - only the
 * match-level `info` block is kept, filtered down to what SportLog actually
 * uses. See FILTERED_INFO_FIELDS below for exactly what's retained.
 *
 * No team-name-to-id mapping is needed here, unlike the football scrapers.
 * Cricsheet's team names are already the plain display names (no "FC"/"AFC"
 * suffix guessing needed), so team ids are derived directly via the same
 * `cricket_team_${slug(name)}` convention index.html already uses for the
 * hand-seeded cricket events. Any team not seen before is appended to
 * data/cricket-teams.json, which index.html loads and merges into
 * SEED_TEAMS - so nothing needs manual upkeep as new countries/franchises
 * show up in the data.
 *
 * Requires the `unzip` command to be available on PATH (present by default
 * on GitHub Actions' ubuntu-latest runners, and on most Linux/macOS dev
 * machines - on Windows, run this under WSL or install unzip separately).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function slug(s) {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function cricketTeamId(name) {
  return `cricket_team_${slug(name)}`;
}

async function downloadAndExtractZip(zipUrl) {
  const res = await fetch(zipUrl);
  if (!res.ok) {
    throw new Error(`Failed to download ${zipUrl}: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cricsheet-"));
  const zipPath = path.join(tmpDir, "data.zip");
  fs.writeFileSync(zipPath, buf);

  const extractDir = path.join(tmpDir, "extracted");
  fs.mkdirSync(extractDir);
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", extractDir]);

  const jsonFiles = fs.readdirSync(extractDir).filter(f => f.endsWith(".json"));
  return { extractDir, jsonFiles, tmpDir };
}

function cleanupTmpDir(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Builds a human-readable result string from Cricsheet's `outcome` object -
// same shape of summary already used for the hand-seeded cricket events
// (e.g. "India won by 7 runs", "New Zealand won by 3 wickets", "Match tied").
function formatOutcome(outcome) {
  if (!outcome) return null;
  if (outcome.winner) {
    const by = outcome.by || {};
    let suffix = "";
    if (by.runs != null) {
      suffix = ` by ${by.runs} run${by.runs === 1 ? "" : "s"}`;
      if (by.innings) suffix = ` by an innings and ${by.runs} run${by.runs === 1 ? "" : "s"}`;
    } else if (by.wickets != null) {
      suffix = ` by ${by.wickets} wicket${by.wickets === 1 ? "" : "s"}`;
    }
    let result = `${outcome.winner} won${suffix}`;
    if (outcome.method) result += ` (${outcome.method})`;
    return result;
  }
  if (outcome.result === "tie") {
    if (outcome.eliminator) return `Match tied (${outcome.eliminator} won the eliminator)`;
    if (outcome.bowl_out) return `Match tied (${outcome.bowl_out} won the bowl-out)`;
    return "Match tied";
  }
  if (outcome.result === "no result") return "No result";
  if (outcome.result === "draw") return "Match drawn";
  return null;
}

// The match-level `info` fields SportLog actually keeps. Cricsheet's `info`
// section has more fields than this (see the full list relayed separately) -
// this is deliberately a "basic match info" cut: identifying/scheduling
// details, teams, result, and who won the toss. Ball-by-ball `innings` data
// is never even read past this point.
function toAppEvent(matchJson, source) {
  const info = matchJson.info;
  if (!info || !Array.isArray(info.teams) || info.teams.length !== 2 || !Array.isArray(info.dates) || !info.dates.length) {
    return null; // malformed/unexpected file shape - skip rather than crash the whole run
  }

  const teamIds = info.teams.map(cricketTeamId);
  const startDate = info.dates[0];
  const seasonLabel = info.season || startDate.slice(0, 4);
  const seasonId = `${source.competitionId}_${slug(String(seasonLabel))}`;

  const isMultiDay = source.matchFormat === "Test" || source.matchFormat === "MDM";
  const roundLabel = info.event?.name
    ? (info.event.match_number ? `${info.event.name}, Match ${info.event.match_number}` : info.event.name)
    : source.competitionName;

  const sportData = {
    kind: isMultiDay ? "cricket_test" : "cricket_t20",
    // Stored explicitly so index.html's sportDataKindFor can route by actual
    // match format rather than guessing from competitionId - needed since
    // there are now many Test-format competitions, not just one.
    matchFormat: source.matchFormat,
    round: roundLabel,
    venue: info.venue || null,
    result: formatOutcome(info.outcome),
    toss: info.toss ? { winner: info.toss.winner, decision: info.toss.decision } : null,
    playerOfMatch: (info.player_of_match && info.player_of_match[0]) || null,
  };
  if (isMultiDay) {
    // Cricsheet doesn't give a "scheduled length" field directly - default
    // to the standard modern 5-day Test, falling back to whatever actually
    // happened if that ran longer (rare, but not impossible for older data).
    sportData.actualDays = info.dates.length;
    sportData.scheduledDays = Math.max(5, sportData.actualDays);
  }

  return {
    sportId: "cricket",
    competitionId: source.competitionId,
    seasonId,
    date: `${startDate}T00:00:00Z`, // Cricsheet gives a date only, no kickoff time
    title: `${info.teams[0]} vs ${info.teams[1]}`,
    participants: teamIds,
    sportData,
    dataQuality: "verified",
    externalIds: { cricsheetId: matchJson.__cricsheetFileId },
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
  return () => `${idPrefix}_${String(++max).padStart(5, "0")}`;
}

// Merges newly-seen teams into data/cricket-teams.json. Additive only -
// never removes a team, since an event elsewhere might still reference it.
function updateTeamRegistry(teamsFile, teamIdsSeen) {
  const existing = loadJsonArrayFile(teamsFile);
  const existingIds = new Set(existing.map(t => t.id));
  let added = 0;
  teamIdsSeen.forEach(({ id, name }) => {
    if (!existingIds.has(id)) {
      existing.push({ id, sportId: "cricket", name });
      existingIds.add(id);
      added++;
    }
  });
  if (added > 0) {
    existing.sort((a, b) => a.name.localeCompare(b.name));
    fs.writeFileSync(teamsFile, JSON.stringify(existing, null, 2) + "\n");
  }
  return added;
}

// Merges newly-seen seasons into data/cricket-seasons.json - same idea as
// updateTeamRegistry, needed so the season filter pills on an entity/
// competition page show a readable label ("2023") instead of falling back
// to the raw seasonId when it's not found in STATE.seasonsById.
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
 * Runs one competition source end-to-end: download zip, extract, filter
 * every match to the fields above, reconcile against the shared
 * data/cricket-events.json file (matched by Cricsheet's own file id, which
 * is stable per match), and merge any new teams into data/cricket-teams.json.
 *
 * source = {
 *   key,                 // short identifier, used for logging only
 *   label,               // human-readable name for logging
 *   zipUrl,               // cricsheet.org JSON zip download URL
 *   competitionId,       // this app's competition id
 *   competitionName,     // used as the `round` fallback when no event/name is given
 *   matchFormat,         // "Test" | "ODI" | "T20" | "IT20" | "ODM" | "MDM" (Cricsheet's own match_type values)
 * }
 */
async function runCricketSource(source, { eventsFile, teamsFile, seasonsFile }) {
  console.log(`\n=== ${source.label} ===`);
  console.log(`Downloading ${source.zipUrl} ...`);
  const { extractDir, jsonFiles, tmpDir } = await downloadAndExtractZip(source.zipUrl);
  console.log(`  extracted ${jsonFiles.length} match files`);

  const existingEvents = loadJsonArrayFile(eventsFile);
  const byCricsheetId = new Map();
  existingEvents.forEach(e => {
    if (e.externalIds?.cricsheetId) byCricsheetId.set(e.externalIds.cricsheetId, e);
  });

  const genId = nextEventId(existingEvents, "evt_cricket");
  const teamsSeen = new Map(); // id -> name, for updateTeamRegistry
  const seasonsSeen = new Map(); // id -> {competitionId, label}, for updateSeasonRegistry
  let added = 0, updated = 0, unchanged = 0, skipped = 0;
  const updatedEvents = [...existingEvents];

  for (const fileName of jsonFiles) {
    const fileId = fileName.replace(/\.json$/, "");
    let matchJson;
    try {
      matchJson = JSON.parse(fs.readFileSync(path.join(extractDir, fileName), "utf8"));
    } catch (err) {
      console.error(`  ! Failed to parse ${fileName}: ${err.message}`);
      skipped++;
      continue;
    }
    matchJson.__cricsheetFileId = fileId;

    const appEvent = toAppEvent(matchJson, source);
    if (!appEvent) {
      skipped++;
      continue;
    }

    appEvent.participants.forEach((id, i) => teamsSeen.set(id, matchJson.info.teams[i]));
    seasonsSeen.set(appEvent.seasonId, {
      competitionId: source.competitionId,
      label: String(matchJson.info.season || matchJson.info.dates[0].slice(0, 4)),
    });

    const existing = byCricsheetId.get(fileId);
    if (existing) {
      const changed = existing.sportData.result !== appEvent.sportData.result
        || existing.date !== appEvent.date
        || existing.sportData.venue !== appEvent.sportData.venue;
      if (changed) {
        existing.date = appEvent.date;
        existing.sportData = appEvent.sportData;
        updated++;
      } else {
        unchanged++;
      }
    } else {
      appEvent.id = genId();
      updatedEvents.push(appEvent);
      added++;
    }
  }

  cleanupTmpDir(tmpDir);

  console.log(`  Added: ${added}  Updated: ${updated}  Unchanged: ${unchanged}  Skipped: ${skipped}`);

  const teamsAdded = updateTeamRegistry(teamsFile, [...teamsSeen.entries()].map(([id, name]) => ({ id, name })));
  if (teamsAdded) console.log(`  New teams added to registry: ${teamsAdded}`);

  const seasonsAdded = updateSeasonRegistry(seasonsFile, [...seasonsSeen.entries()].map(([id, v]) => ({ id, ...v })));
  if (seasonsAdded) console.log(`  New seasons added to registry: ${seasonsAdded}`);

  if (added || updated) {
    updatedEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
    fs.writeFileSync(eventsFile, JSON.stringify(updatedEvents, null, 2) + "\n");
  }

  return { added, updated, unchanged, skipped, teamsAdded, seasonsAdded };
}

module.exports = { runCricketSource, cricketTeamId, slug };
