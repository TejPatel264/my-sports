#!/usr/bin/env node
/**
 * diagnose-api-football.js
 *
 * One-off diagnostic, not part of the regular scraper pipeline. Run this
 * when a competition script reports "0 fixtures received" and it's unclear
 * whether that's a wrong league ID, a season-coverage gap, or a plan
 * restriction. Doesn't touch any data files.
 *
 * Run locally:
 *   API_FOOTBALL_KEY=xxxx node scripts/diagnose-api-football.js
 */

const API_BASE = "https://v3.football.api-sports.io";

async function call(pathAndQuery) {
  const res = await fetch(`${API_BASE}${pathAndQuery}`, {
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  if (!process.env.API_FOOTBALL_KEY) {
    console.error("Set API_FOOTBALL_KEY first.");
    process.exit(1);
  }

  console.log("1. Account/plan status (checks for season/plan restrictions)");
  console.log("   GET /status");
  const status = await call("/status");
  console.log(JSON.stringify(status.body, null, 2));
  console.log("");

  console.log("2. Confirm the Carabao Cup / EFL Cup league ID (checks if 48 is right,");
  console.log("   and what season values it actually has data for)");
  console.log("   GET /leagues?search=carabao");
  const bySearch = await call("/leagues?search=carabao");
  console.log(JSON.stringify(bySearch.body?.response, null, 2));
  console.log("");
  console.log("   GET /leagues?search=EFL Cup  (in case it's indexed under this name instead)");
  const byEflName = await call("/leagues?search=EFL Cup");
  console.log(JSON.stringify(byEflName.body?.response, null, 2));
  console.log("");

  console.log("3. What id=48 actually resolves to, and its season coverage");
  console.log("   GET /leagues?id=48");
  const byId = await call("/leagues?id=48");
  console.log(JSON.stringify(byId.body?.response, null, 2));
  console.log("");

  console.log("4. Raw fixtures call exactly as update-carabao-cup.js makes it");
  console.log("   GET /fixtures?league=48&season=2026");
  const fixtures = await call("/fixtures?league=48&season=2026");
  console.log(`   status: ${fixtures.status}, results: ${fixtures.body?.results}`);
  if (fixtures.body?.errors && Object.keys(fixtures.body.errors).length) {
    console.log("   errors:", JSON.stringify(fixtures.body.errors));
  }

  console.log("");
  console.log("---");
  console.log("What to look at:");
  console.log("- In (1): does 'subscription.plan' say Free, and is there anything about seasons?");
  console.log("- In (2)/(3): does a league show up with 'Carabao Cup' or 'EFL Cup' in the name, and does id=48 match it?");
  console.log("  If id=48 resolves to something else entirely (wrong competition/country), that's the bug.");
  console.log("- In (3): check the 'seasons' array on the matched league - does 2026 appear in it at all?");
  console.log("  If 2026 is missing but 2025 (or an earlier year) is present, the league ID is probably right");
  console.log("  but the season value/coverage is the problem - possibly a free-plan restriction, or the current");
  console.log("  round just hasn't been drawn/added to their database yet.");
}

main().catch(err => {
  console.error("Diagnostic failed:", err);
  process.exit(1);
});
