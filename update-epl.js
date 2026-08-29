#!/usr/bin/env node
/**
 * update-epl.js
 *
 * Fetches Premier League matches from football-data.org and updates
 * data/epl-events.json. See scripts/update-football-competition.js for the
 * shared fetch/match/write logic this just configures.
 *
 * Run locally:
 *   FOOTBALL_DATA_API_KEY=xxxx node scripts/update-epl.js
 */

const path = require("path");
const { runUpdate } = require("./update-football-competition.js");

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

runUpdate({
  competitionCode: "PL",
  competitionId: "epl",
  idPrefix: "evt_epl",
  dataFile: path.join(__dirname, "..", "data", "epl-events.json"),
  teamNameToId: TEAM_NAME_TO_ID,
  // 2026/27 Premier League season runs Aug 2026 - May 2027. Scoped to the
  // current season only for the MVP; a fixture outside this window is
  // flagged and skipped rather than silently misfiled.
  seasonWindows: [
    { seasonId: "epl_2026_27", start: "2026-07-01T00:00:00Z", end: "2027-07-01T00:00:00Z" },
  ],
}).catch(err => {
  console.error("update-epl.js failed:");
  console.error(err);
  process.exit(1);
});
