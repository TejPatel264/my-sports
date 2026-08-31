#!/usr/bin/env node
/**
 * update-cricket.js
 *
 * Runs every requested Cricsheet competition source through
 * cricsheet-common.js, writing into a single shared data/cricket-events.json
 * (all cricket competitions in one file, differentiated by competitionId -
 * simpler than one file per source given there are 16 of these and, unlike
 * the football scrapers, no per-competition team mapping to keep separate)
 * and data/cricket-teams.json (auto-populated team registry).
 *
 * NAMING NOTE: there's no "Women's IPL" - the Indian women's T20 league is a
 * separate competition, the Women's Premier League (WPL), not a women's
 * edition of the IPL. Mapped here as its own entry rather than paired with
 * "ipl", since that's what it actually is.
 *
 * NOTE ON THE MEN'S T20 WORLD CUP: this reuses the existing "t20_world_cup"
 * competitionId (already used by a handful of hand-seeded events in
 * index.html) rather than creating a separate one, so scraped matches land
 * in the same competition/timeline instead of fragmenting it. Every other
 * source here is a new competitionId with no prior hand-seeded data.
 *
 * Run locally:
 *   node scripts/update-cricket.js            (all sources)
 *   node scripts/update-cricket.js hundred_men (just one, by key - useful when testing)
 *
 * Requires the `unzip` command on PATH (see cricsheet-common.js).
 */

const path = require("path");
const { runCricketSource } = require("./cricsheet-common.js");

const EVENTS_FILE = path.join(__dirname, "..", "data", "cricket-events.json");
const TEAMS_FILE = path.join(__dirname, "..", "data", "cricket-teams.json");
const SEASONS_FILE = path.join(__dirname, "..", "data", "cricket-seasons.json");

const SOURCES = [
  // ---- The Hundred ----
  { key: "hundred_men", label: "The Hundred (Men's)",
    zipUrl: "https://cricsheet.org/downloads/hnd_male_json.zip",
    competitionId: "hundred_men", competitionName: "The Hundred (Men's)", matchFormat: "T20" },
  { key: "hundred_women", label: "The Hundred (Women's)",
    zipUrl: "https://cricsheet.org/downloads/hnd_female_json.zip",
    competitionId: "hundred_women", competitionName: "The Hundred (Women's)", matchFormat: "T20" },

  // ---- IPL / WPL (see naming note above - these are two different competitions, not one gender pair) ----
  { key: "ipl", label: "Indian Premier League",
    zipUrl: "https://cricsheet.org/downloads/ipl_male_json.zip",
    competitionId: "ipl", competitionName: "Indian Premier League", matchFormat: "T20" },
  { key: "wpl", label: "Women's Premier League (India)",
    zipUrl: "https://cricsheet.org/downloads/wpl_female_json.zip",
    competitionId: "wpl", competitionName: "Women's Premier League", matchFormat: "T20" },

  // ---- Vitality Blast (Cricsheet lists these as "T20 Blast" / "Women's T20 Blast") ----
  { key: "vitality_blast_men", label: "Vitality Blast (Men's)",
    zipUrl: "https://cricsheet.org/downloads/ntb_male_json.zip",
    competitionId: "vitality_blast_men", competitionName: "Vitality Blast (Men's)", matchFormat: "T20" },
  { key: "vitality_blast_women", label: "Vitality Blast (Women's)",
    zipUrl: "https://cricsheet.org/downloads/wtb_female_json.zip",
    competitionId: "vitality_blast_women", competitionName: "Vitality Blast (Women's)", matchFormat: "T20" },

  // ---- International formats ----
  { key: "test_men", label: "Test Matches (Men's)",
    zipUrl: "https://cricsheet.org/downloads/tests_male_json.zip",
    competitionId: "test_cricket_men", competitionName: "Test Cricket (Men's)", matchFormat: "Test" },
  { key: "test_women", label: "Test Matches (Women's)",
    zipUrl: "https://cricsheet.org/downloads/tests_female_json.zip",
    competitionId: "test_cricket_women", competitionName: "Test Cricket (Women's)", matchFormat: "Test" },

  { key: "odi_men", label: "One-Day Internationals (Men's)",
    zipUrl: "https://cricsheet.org/downloads/odis_male_json.zip",
    competitionId: "odi_cricket_men", competitionName: "One-Day Internationals (Men's)", matchFormat: "ODI" },
  { key: "odi_women", label: "One-Day Internationals (Women's)",
    zipUrl: "https://cricsheet.org/downloads/odis_female_json.zip",
    competitionId: "odi_cricket_women", competitionName: "One-Day Internationals (Women's)", matchFormat: "ODI" },

  { key: "t20i_men", label: "T20 Internationals (Men's)",
    zipUrl: "https://cricsheet.org/downloads/t20s_male_json.zip",
    competitionId: "t20i_cricket_men", competitionName: "T20 Internationals (Men's)", matchFormat: "T20" },
  { key: "t20i_women", label: "T20 Internationals (Women's)",
    zipUrl: "https://cricsheet.org/downloads/t20s_female_json.zip",
    competitionId: "t20i_cricket_women", competitionName: "T20 Internationals (Women's)", matchFormat: "T20" },

  // ---- ICC World Cups ----
  { key: "t20wc_men", label: "ICC Men's T20 World Cup",
    zipUrl: "https://cricsheet.org/downloads/icc_mens_t20_world_cup_male_json.zip",
    competitionId: "t20_world_cup", competitionName: "ICC Men's T20 World Cup", matchFormat: "T20" }, // reuses existing id, see note above
  { key: "t20wc_women", label: "ICC Women's T20 World Cup",
    zipUrl: "https://cricsheet.org/downloads/icc_womens_t20_world_cup_female_json.zip",
    competitionId: "icc_womens_t20_world_cup", competitionName: "ICC Women's T20 World Cup", matchFormat: "T20" },

  { key: "odiwc_men", label: "ICC Men's Cricket World Cup",
    zipUrl: "https://cricsheet.org/downloads/icc_mens_cricket_world_cup_male_json.zip",
    competitionId: "icc_mens_odi_world_cup", competitionName: "ICC Men's Cricket World Cup", matchFormat: "ODI" },
  { key: "odiwc_women", label: "ICC Women's Cricket World Cup",
    zipUrl: "https://cricsheet.org/downloads/icc_womens_cricket_world_cup_female_json.zip",
    competitionId: "icc_womens_odi_world_cup", competitionName: "ICC Women's Cricket World Cup", matchFormat: "ODI" },
];

async function main() {
  const onlyKey = process.argv[2]; // optional: run a single source by key, for local testing
  const sourcesToRun = onlyKey ? SOURCES.filter(s => s.key === onlyKey) : SOURCES;
  if (onlyKey && sourcesToRun.length === 0) {
    console.error(`No source with key "${onlyKey}". Valid keys: ${SOURCES.map(s => s.key).join(", ")}`);
    process.exit(1);
  }

  const totals = { added: 0, updated: 0, unchanged: 0, skipped: 0, teamsAdded: 0, seasonsAdded: 0 };
  for (const source of sourcesToRun) {
    try {
      const result = await runCricketSource(source, { eventsFile: EVENTS_FILE, teamsFile: TEAMS_FILE, seasonsFile: SEASONS_FILE });
      totals.added += result.added;
      totals.updated += result.updated;
      totals.unchanged += result.unchanged;
      totals.skipped += result.skipped;
      totals.teamsAdded += result.teamsAdded;
      totals.seasonsAdded += result.seasonsAdded;
    } catch (err) {
      console.error(`! ${source.label} failed: ${err.message}`);
    }
  }

  console.log("\n=== Totals across all sources ===");
  console.log(`Added: ${totals.added}  Updated: ${totals.updated}  Unchanged: ${totals.unchanged}  Skipped: ${totals.skipped}  New teams: ${totals.teamsAdded}  New seasons: ${totals.seasonsAdded}`);
}

main().catch(err => {
  console.error("update-cricket.js failed:");
  console.error(err);
  process.exit(1);
});
