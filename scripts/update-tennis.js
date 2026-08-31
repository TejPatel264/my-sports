#!/usr/bin/env node
/**
 * update-tennis.js
 *
 * Pulls ATP and WTA match data from stats.tennismylife.org (MIT-licensed,
 * see tennis-common.js header for details) and writes into a single shared
 * data/tennis-events.json, with companion auto-populated
 * data/tennis-players.json, data/tennis-competitions.json, and
 * data/tennis-seasons.json registries - same reasoning as the cricket
 * scraper: hundreds of distinct players/tournaments make a hand-maintained
 * mapping impractical, so anything new gets appended automatically.
 *
 * Scoped to 2020 onward per what was asked for, plus each tour's "ongoing"
 * file so in-progress tournaments show up before being folded into next
 * year's yearly file.
 *
 * Run locally:
 *   node scripts/update-tennis.js        (both tours)
 *   node scripts/update-tennis.js atp    (just one, for testing)
 */

const path = require("path");
const { runTennisTour } = require("./tennis-common.js");

const MIN_YEAR = 2020;
const EVENTS_FILE = path.join(__dirname, "..", "data", "tennis-events.json");
const PLAYERS_FILE = path.join(__dirname, "..", "data", "tennis-players.json");
const COMPETITIONS_FILE = path.join(__dirname, "..", "data", "tennis-competitions.json");
const SEASONS_FILE = path.join(__dirname, "..", "data", "tennis-seasons.json");

async function main() {
  const onlyTour = process.argv[2]; // optional: "atp" or "wta", for local testing
  const tours = onlyTour ? [onlyTour] : ["atp", "wta"];

  const totals = { added: 0, updated: 0, unchanged: 0, skipped: 0, playersAdded: 0, competitionsAdded: 0, seasonsAdded: 0 };
  for (const tour of tours) {
    try {
      const result = await runTennisTour(tour, {
        minYear: MIN_YEAR,
        eventsFile: EVENTS_FILE,
        playersFile: PLAYERS_FILE,
        competitionsFile: COMPETITIONS_FILE,
        seasonsFile: SEASONS_FILE,
      });
      Object.keys(totals).forEach(k => { totals[k] += result[k] || 0; });
    } catch (err) {
      console.error(`! ${tour.toUpperCase()} failed: ${err.message}`);
    }
  }

  console.log("\n=== Totals ===");
  console.log(`Added: ${totals.added}  Updated: ${totals.updated}  Unchanged: ${totals.unchanged}  Skipped: ${totals.skipped}`);
  console.log(`New players: ${totals.playersAdded}  New competitions: ${totals.competitionsAdded}  New seasons: ${totals.seasonsAdded}`);
}

main().catch(err => {
  console.error("update-tennis.js failed:");
  console.error(err);
  process.exit(1);
});
