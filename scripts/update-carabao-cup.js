#!/usr/bin/env node
/**
 * update-carabao-cup.js
 *
 * Fetches Carabao Cup (EFL Cup) fixtures/results from api-football.com and
 * updates data/carabao-cup-events.json. See
 * scripts/update-football-competition-api-football.js for the shared
 * fetch/match/write logic this just configures.
 *
 * The Carabao Cup draws from all 92 Premier League + EFL clubs (PL and
 * Championship clubs enter later, at Round 3), so this mapping is wider
 * than the EPL/Championship ones - it covers every club that could
 * plausibly appear in a given season's draw. An unmapped team throws
 * rather than silently mis-filing, same pattern as the other scripts.
 *
 * Run locally:
 *   RAPIDAPI_KEY=xxxx node scripts/update-carabao-cup.js
 */

const path = require("path");
const { runUpdate } = require("./update-football-competition-api-football.js");

// api-football.com league ID for the EFL Cup (Carabao Cup).
const LEAGUE_ID = 48;

const TEAM_NAME_TO_ID = {
  // Premier League 2026/27
  "Arsenal": "team_arsenal",
  "Aston Villa": "team_aston_villa",
  "Bournemouth": "team_afc_bournemouth",
  "Brentford": "team_brentford",
  "Brighton": "team_brighton_and_hove_albion",
  "Chelsea": "team_chelsea",
  "Crystal Palace": "team_crystal_palace",
  "Everton": "team_everton",
  "Fulham": "team_fulham",
  "Leeds": "team_leeds_united",
  "Liverpool": "team_liverpool",
  "Manchester City": "team_manchester_city",
  "Manchester United": "team_manchester_united",
  "Newcastle": "team_newcastle_united",
  "Nottingham Forest": "team_nottingham_forest",
  "Sunderland": "team_sunderland",
  "Tottenham": "team_tottenham_hotspur",
  "Hull City": "team_hull_city",
  "Coventry": "team_coventry_city",
  "Ipswich": "team_ipswich_town",
  "West Ham": "team_west_ham_united",
  "Wolves": "team_wolverhampton_wanderers",
  "Burnley": "team_burnley",
  "Leicester": "team_leicester_city",
  "Southampton": "team_southampton",

  // Championship (non-PL clubs likely to enter at Round 1/2)
  "Blackburn Rovers": "team_blackburn_rovers",
  "Bristol City": "team_bristol_city",
  "Cardiff": "team_cardiff_city",
  "Charlton Athletic": "team_charlton_athletic",
  "Derby": "team_derby_county",
  "Middlesbrough": "team_middlesbrough",
  "Millwall": "team_millwall",
  "Norwich": "team_norwich_city",
  "Oxford United": "team_oxford_united",
  "Portsmouth": "team_portsmouth",
  "Preston": "team_preston_north_end",
  "QPR": "team_queens_park_rangers",
  "Sheffield United": "team_sheffield_united",
  "Sheffield Wednesday": "team_sheffield_wednesday",
  "Stoke City": "team_stoke_city",
  "Swansea": "team_swansea_city",
  "Watford": "team_watford",
  "West Bromwich Albion": "team_west_bromwich_albion",
  "Wrexham": "team_wrexham",

  // League One
  "Barnsley": "team_barnsley",
  "Birmingham": "team_birmingham_city",
  "Blackpool": "team_blackpool",
  "Bolton": "team_bolton_wanderers",
  "Bradford City": "team_bradford_city",
  "Cambridge United": "team_cambridge_united",
  "Doncaster Rovers": "team_doncaster_rovers",
  "Exeter City": "team_exeter_city",
  "Huddersfield": "team_huddersfield_town",
  "Leyton Orient": "team_leyton_orient",
  "Lincoln City": "team_lincoln_city",
  "Luton": "team_luton_town",
  "Mansfield Town": "team_mansfield_town",
  "Northampton": "team_northampton_town",
  "Peterborough United": "team_peterborough_united",
  "Plymouth Argyle": "team_plymouth_argyle",
  "Reading": "team_reading",
  "Rotherham United": "team_rotherham_united",
  "Stevenage": "team_stevenage",
  "Wigan Athletic": "team_wigan_athletic",
  "Wycombe": "team_wycombe_wanderers",

  // League Two
  "AFC Wimbledon": "team_afc_wimbledon",
  "Accrington Stanley": "team_accrington_stanley",
  "Barnet": "team_barnet",
  "Barrow": "team_barrow",
  "Bristol Rovers": "team_bristol_rovers",
  "Bromley": "team_bromley",
  "Cheltenham Town": "team_cheltenham_town",
  "Chesterfield": "team_chesterfield",
  "Colchester United": "team_colchester_united",
  "Crawley Town": "team_crawley_town",
  "Crewe Alexandra": "team_crewe_alexandra",
  "Fleetwood Town": "team_fleetwood_town",
  "Gillingham": "team_gillingham",
  "Grimsby Town": "team_grimsby_town",
  "Harrogate Town": "team_harrogate_town",
  "Milton Keynes Dons": "team_milton_keynes_dons",
  "Newport County": "team_newport_county",
  "Notts County": "team_notts_county",
  "Salford City": "team_salford_city",
  "Swindon Town": "team_swindon_town",
  "Tranmere Rovers": "team_tranmere_rovers",
  "Walsall": "team_walsall",
};

runUpdate({
  leagueId: LEAGUE_ID,
  season: 2026,
  competitionId: "carabao_cup",
  idPrefix: "evt_carabao",
  dataFile: path.join(__dirname, "..", "data", "carabao-cup-events.json"),
  teamNameToId: TEAM_NAME_TO_ID,
  // 2026/27 Carabao Cup runs Aug 2026 - Mar 2027 (final). Scoped to the
  // current season only for the MVP, same pattern as update-epl.js.
  seasonWindows: [
    { seasonId: "carabao_cup_2026_27", start: "2026-07-01T00:00:00Z", end: "2027-04-01T00:00:00Z" },
  ],
}).catch(err => {
  console.error("update-carabao-cup.js failed:");
  console.error(err);
  process.exit(1);
});
