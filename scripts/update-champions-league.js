#!/usr/bin/env node
/**
 * update-champions-league.js
 *
 * Fetches UEFA Champions League matches from football-data.org and updates
 * data/champions-league-events.json. See scripts/update-football-competition.js
 * for the shared fetch/match/write logic this just configures - same as
 * update-epl.js and update-championship.js.
 *
 * Only scheduled weekly (Thursdays) rather than daily, since the CL calendar
 * moves in matchdays roughly a month apart rather than a weekly domestic
 * fixture list - see .github/workflows/update-champions-league.yml.
 *
 * NOTE ON TEAM NAMES: this mapping covers the 36 clubs confirmed for the
 * 2026/27 league phase (draw held 27 Aug 2026). Names follow football-data.org's
 * typical official-name convention ("Real Madrid CF", "FC Bayern München",
 * etc.), matching the pattern already used for the EPL/Championship scripts,
 * but - same caveat as update-championship.js - this has not been verified
 * against a live API response. If "Unrecognized team name" errors show up
 * on the first real run, check the actual name in the error message and
 * correct the entry below.
 *
 * Run locally:
 *   FOOTBALL_DATA_API_KEY=xxxx node scripts/update-champions-league.js
 */

const path = require("path");
const { runUpdate } = require("./update-football-competition.js");

const TEAM_NAME_TO_ID = {
  // England (already covered by the EPL team list, reused here)
  "Arsenal FC": "team_arsenal",
  "Aston Villa FC": "team_aston_villa",
  "Liverpool FC": "team_liverpool",
  "Manchester City FC": "team_manchester_city",
  "Manchester United FC": "team_manchester_united",

  // Spain
  "Real Madrid CF": "team_real_madrid",
  "FC Barcelona": "team_barcelona",
  "Club Atlético de Madrid": "team_atletico_madrid",
  "Villarreal CF": "team_villarreal",
  "Real Betis Balompié": "team_real_betis",

  // Germany
  "FC Bayern München": "team_bayern_munich",
  "Borussia Dortmund": "team_borussia_dortmund",
  "RB Leipzig": "team_rb_leipzig",
  "VfB Stuttgart": "team_stuttgart",

  // Italy
  "FC Internazionale Milano": "team_inter_milan",
  "SSC Napoli": "team_napoli",
  "AS Roma": "team_roma",
  "Como 1907": "team_como",

  // France
  "Paris Saint-Germain FC": "team_paris_saint_germain",
  "Racing Club de Lens": "team_lens",
  "LOSC Lille": "team_lille",

  // Portugal
  "FC Porto": "team_porto",
  "Sporting Clube de Portugal": "team_sporting_cp",

  // Netherlands
  "PSV": "team_psv_eindhoven",
  "Feyenoord Rotterdam": "team_feyenoord",

  // Belgium
  "Club Brugge KV": "team_club_brugge",

  // Turkey
  "Galatasaray SK": "team_galatasaray",
  "Fenerbahçe SK": "team_fenerbahce",

  // Ukraine
  "FC Shakhtar Donetsk": "team_shakhtar_donetsk",

  // Czechia
  "SK Slavia Praha": "team_slavia_prague",

  // Slovakia
  "ŠK Slovan Bratislava": "team_slovan_bratislava",

  // Norway
  "FK Bodø/Glimt": "team_bodo_glimt",
  "Viking FK": "team_viking_fk",

  // Austria
  "LASK": "team_lask",

  // Greece
  "AEK Athens FC": "team_aek_athens",

  // Azerbaijan
  "Sabah FK": "team_sabah_fk",
};

runUpdate({
  competitionCode: "CL",
  competitionId: "champions_league",
  idPrefix: "evt_ucl",
  dataFile: path.join(__dirname, "..", "data", "champions-league-events.json"),
  teamNameToId: TEAM_NAME_TO_ID,
  // 2026/27 Champions League: qualifying started July 2026, league phase
  // starts 8 Sept 2026, final 5 June 2027. Same broad-window shape as the
  // other scripts, wide enough to cover the whole season without needing
  // per-stage windows.
  seasonWindows: [
    { seasonId: "champions_league_2026_27", start: "2026-07-01T00:00:00Z", end: "2027-07-01T00:00:00Z" },
  ],
}).catch(err => {
  console.error("update-champions-league.js failed:");
  console.error(err);
  process.exit(1);
});
