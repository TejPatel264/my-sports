#!/usr/bin/env node
/**
 * update-championship.js
 *
 * Fetches EFL Championship matches from football-data.org and updates
 * data/championship-events.json. See scripts/update-football-competition.js
 * for the shared fetch/match/write logic this just configures.
 *
 * NOTE ON TEAM NAMES: football-data.org's naming convention typically
 * suffixes " FC" or " AFC" (matching the pattern already confirmed working
 * for the Premier League script), but this mapping has not yet been
 * verified against a live API response for the Championship specifically -
 * there was no API key available to check while writing this. On the
 * first real run, if you see "Unrecognized team name" errors, that's
 * expected: check the actual name football-data.org sent (it'll be in the
 * error message) and correct the entry below. This is exactly the kind of
 * thing the script is designed to fail loudly on rather than silently
 * mismatch, per the existing team-name-mapping approach.
 *
 * Run locally:
 *   FOOTBALL_DATA_API_KEY=xxxx node scripts/update-championship.js
 */

const path = require("path");
const { runUpdate } = require("./update-football-competition.js");

const TEAM_NAME_TO_ID = {
  "Birmingham City FC": "team_birmingham_city",
  "Blackburn Rovers FC": "team_blackburn_rovers",
  "Bolton Wanderers FC": "team_bolton_wanderers",
  "Bristol City FC": "team_bristol_city",
  "Burnley FC": "team_burnley",
  "Cardiff City FC": "team_cardiff_city",
  "Charlton Athletic FC": "team_charlton_athletic",
  "Derby County FC": "team_derby_county",
  "Lincoln City FC": "team_lincoln_city",
  "Middlesbrough FC": "team_middlesbrough",
  "Millwall FC": "team_millwall",
  "Norwich City FC": "team_norwich_city",
  "Portsmouth FC": "team_portsmouth",
  "Preston North End FC": "team_preston_north_end",
  "Queens Park Rangers FC": "team_queens_park_rangers",
  "Sheffield United FC": "team_sheffield_united",
  "Southampton FC": "team_southampton",
  "Stoke City FC": "team_stoke_city",
  "Swansea City AFC": "team_swansea_city",
  "Watford FC": "team_watford",
  "West Bromwich Albion FC": "team_west_bromwich_albion",
  "West Ham United FC": "team_west_ham_united",
  "Wolverhampton Wanderers FC": "team_wolverhampton_wanderers",
  "Wrexham AFC": "team_wrexham",
};

runUpdate({
  competitionCode: "ELC",
  competitionId: "championship",
  idPrefix: "evt_championship",
  dataFile: path.join(__dirname, "..", "data", "championship-events.json"),
  teamNameToId: TEAM_NAME_TO_ID,
  // 2026/27 Championship season runs Aug 2026 - May 2027 (plus play-offs
  // into early-to-mid May). Same window shape as the PL script.
  seasonWindows: [
    { seasonId: "championship_2026_27", start: "2026-07-01T00:00:00Z", end: "2027-07-01T00:00:00Z" },
  ],
}).catch(err => {
  console.error("update-championship.js failed:");
  console.error(err);
  process.exit(1);
});
