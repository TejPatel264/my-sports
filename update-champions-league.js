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
 * NOTE ON TEAM NAMES: originally built from assumed football-data.org
 * naming conventions for the 36 clubs confirmed at the 2026/27 draw. A
 * real run against the API (28 Aug 2026) surfaced football-data.org's
 * actual names for a batch of clubs - it happened to return the *2025/26*
 * season (football-data.org hadn't published 2026/27 fixtures yet at that
 * point), so the confirmed names below are from clubs in last season's
 * field, not necessarily this season's 36. Kept anyway: verified naming
 * conventions are useful regardless of which season a club appears in, and
 * several of these (Juventus, Ajax, Benfica, Atalanta, etc.) are frequent
 * UCL entrants likely to recur. Entries not yet confirmed against a live
 * response are marked below; if "Unrecognized team name" errors show up
 * once 2026/27 fixtures are actually published, check the name in the
 * error against what's here and correct as needed.
 *
 * Run locally:
 *   FOOTBALL_DATA_API_KEY=xxxx node scripts/update-champions-league.js
 */

const path = require("path");
const { runUpdate } = require("./update-football-competition.js");

const TEAM_NAME_TO_ID = {
  // England (already covered by the EPL team list, reused here).
  // Confirmed against a live response: Chelsea, Tottenham, Newcastle.
  "Arsenal FC": "team_arsenal",
  "Aston Villa FC": "team_aston_villa",
  "Liverpool FC": "team_liverpool",
  "Manchester City FC": "team_manchester_city",
  "Manchester United FC": "team_manchester_united",
  "Chelsea FC": "team_chelsea",                     // confirmed 28 Aug 2026
  "Tottenham Hotspur FC": "team_tottenham_hotspur",  // confirmed 28 Aug 2026
  "Newcastle United FC": "team_newcastle_united",    // confirmed 28 Aug 2026

  // Spain (unconfirmed - not seen in a live response yet)
  "Real Madrid CF": "team_real_madrid",
  "FC Barcelona": "team_barcelona",
  "Club Atlético de Madrid": "team_atletico_madrid",
  "Villarreal CF": "team_villarreal",
  "Real Betis Balompié": "team_real_betis",
  "Athletic Club": "team_athletic_bilbao",           // confirmed 28 Aug 2026

  // Germany (unconfirmed except Frankfurt/Leverkusen)
  "FC Bayern München": "team_bayern_munich",
  "Borussia Dortmund": "team_borussia_dortmund",
  "RB Leipzig": "team_rb_leipzig",
  "VfB Stuttgart": "team_stuttgart",
  "Eintracht Frankfurt": "team_eintracht_frankfurt", // confirmed 28 Aug 2026
  "Bayer 04 Leverkusen": "team_bayer_leverkusen",    // confirmed 28 Aug 2026

  // Italy (unconfirmed except Juventus/Atalanta)
  "FC Internazionale Milano": "team_inter_milan",
  "SSC Napoli": "team_napoli",
  "AS Roma": "team_roma",
  "Como 1907": "team_como",
  "Juventus FC": "team_juventus",                    // confirmed 28 Aug 2026
  "Atalanta BC": "team_atalanta",                    // confirmed 28 Aug 2026

  // France (unconfirmed except Marseille/Monaco)
  "Paris Saint-Germain FC": "team_paris_saint_germain",
  "Racing Club de Lens": "team_lens",
  "LOSC Lille": "team_lille",
  "Olympique de Marseille": "team_marseille",        // confirmed 28 Aug 2026
  "AS Monaco FC": "team_monaco",                     // confirmed 28 Aug 2026

  // Portugal (unconfirmed except Benfica)
  "FC Porto": "team_porto",
  "Sporting Clube de Portugal": "team_sporting_cp",
  "Sport Lisboa e Benfica": "team_benfica",           // confirmed 28 Aug 2026

  // Netherlands (unconfirmed except Ajax)
  "PSV": "team_psv_eindhoven",
  "Feyenoord Rotterdam": "team_feyenoord",
  "AFC Ajax": "team_ajax",                            // confirmed 28 Aug 2026

  // Belgium
  "Club Brugge KV": "team_club_brugge",               // unconfirmed
  "Royale Union Saint-Gilloise": "team_union_saint_gilloise", // confirmed 28 Aug 2026

  // Turkey (unconfirmed)
  "Galatasaray SK": "team_galatasaray",
  "Fenerbahçe SK": "team_fenerbahce",

  // Ukraine (unconfirmed)
  "FC Shakhtar Donetsk": "team_shakhtar_donetsk",

  // Czechia (unconfirmed)
  "SK Slavia Praha": "team_slavia_prague",

  // Slovakia (unconfirmed)
  "ŠK Slovan Bratislava": "team_slovan_bratislava",

  // Norway (unconfirmed)
  "FK Bodø/Glimt": "team_bodo_glimt",
  "Viking FK": "team_viking_fk",

  // Austria (unconfirmed)
  "LASK": "team_lask",

  // Greece (unconfirmed except Olympiacos)
  "AEK Athens FC": "team_aek_athens",
  "PAE Olympiakos SFP": "team_olympiacos",            // confirmed 28 Aug 2026

  // Azerbaijan (unconfirmed except Qarabağ)
  "Sabah FK": "team_sabah_fk",
  "Qarabağ Ağdam FK": "team_qarabag",                 // confirmed 28 Aug 2026

  // Denmark - not in the original 2026/27 mapping, added from the live response
  "FC København": "team_copenhagen",                  // confirmed 28 Aug 2026

  // Kazakhstan - not in the original 2026/27 mapping, added from the live response
  "FK Kairat": "team_kairat",                         // confirmed 28 Aug 2026

  // Cyprus - not in the original 2026/27 mapping, added from the live response
  "Paphos FC": "team_pafos",                          // confirmed 28 Aug 2026
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
