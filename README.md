# SportLog

A personal sports-viewing archive. Single-page app, local-first (IndexedDB via Dexie), no backend for the app itself.

## Project structure

```
index.html                          the app (still one file for now - CSS/JS split is a planned follow-up)
data/
  epl-events.json                   Premier League fixtures/results
  championship-events.json          EFL Championship fixtures/results
  carabao-cup-events.json           Carabao Cup (EFL Cup) fixtures/results
  champions-league-events.json      UEFA Champions League fixtures/results
  cricket-events.json               All 16 cricket competitions' matches (filtered from cricsheet.org)
  cricket-teams.json                Auto-populated cricket team registry (countries/franchises)
  cricket-seasons.json              Auto-populated cricket season labels
  tennis-events.json                ATP + WTA matches, 2020-present (from stats.tennismylife.org)
  tennis-players.json               Auto-populated tennis player registry
  tennis-competitions.json          Auto-populated tennis tournament registry
  tennis-seasons.json               Auto-populated tennis season labels
scripts/
  update-football-competition.js               shared fetch/match/write logic (football-data.org), used by the three scripts below
  update-epl.js                                configures the shared logic for the Premier League (PL)
  update-championship.js                       configures the shared logic for the Championship (ELC)
  update-champions-league.js                   configures the shared logic for the Champions League (CL)
  update-football-competition-api-football.js  shared fetch/match/write logic (api-football.com), used by update-carabao-cup.js
  update-carabao-cup.js                        configures the shared logic for the Carabao Cup
  cricsheet-common.js                          shared download/extract/filter/reconcile logic (cricsheet.org), used by update-cricket.js
  update-cricket.js                            config array of all 16 cricket sources + runner
  tennis-common.js                             shared fetch/parse/filter/reconcile logic (stats.tennismylife.org), used by update-tennis.js
  update-tennis.js                             ATP + WTA runner
  package.json
.github/workflows/
  update-fixtures.yml               runs the daily football-data.org scripts (PL, Championship) once a day
  update-champions-league.yml       runs the Champions League scraper once a week, Thursdays 02:00 UTC
  update-carabao-cup.yml            runs the Carabao Cup scraper once a day via GitHub Actions
  update-cricket.yml                runs all 16 cricket sources once a week, Sundays 03:00 UTC
  update-tennis.yml                 runs the tennis scraper once a day, 00:00 UTC
```

All other sports (F1, darts, cricket, tournament archive) are still defined inline in `index.html`. Premier League was split out first as the proof of concept for the update-script approach, Championship followed the same pattern; other sports can move to their own JSON files + scripts the same way, one at a time.

## Running the app

Needs to be served over HTTP, not opened directly as a `file://` URL — the app fetches the `data/*.json` files at load time, and browsers block that kind of fetch from a local file for security reasons. GitHub Pages serves it correctly. For local testing:

```
python3 -m http.server 8080
# then open http://localhost:8080/
```

## Keeping fixture data up to date

`scripts/update-football-competition.js` holds the shared logic; `update-epl.js`, `update-championship.js`, and `update-champions-league.js` are thin config files that point it at a specific competition:

1. Fetches matches from [football-data.org](https://www.football-data.org) (free tier, no cost — Premier League, Championship, and Champions League are all on the always-free competition list).
2. Matches them against what's already in the relevant `data/*.json` file — first by an internal ID the script attaches to each event once matched, falling back to team-pair + date for anything not yet matched (i.e. the first run against pre-existing or empty data).
3. Adds new fixtures it hasn't seen, updates existing ones (kickoff time moved, venue confirmed, result posted), and leaves everything else untouched.
4. Writes the file back only if something actually changed.

`data/championship-events.json` and `data/champions-league-events.json` both start as empty arrays (`[]`) — unlike EPL, which had an initial hand-sourced set of fixtures, both are a genuine test of the script populating a competition from nothing.

### Running it locally

1. Get a free API key: [football-data.org/client/register](https://www.football-data.org/client/register).
2. Run any or all:
   ```
   FOOTBALL_DATA_API_KEY=your_key_here node scripts/update-epl.js
   FOOTBALL_DATA_API_KEY=your_key_here node scripts/update-championship.js
   FOOTBALL_DATA_API_KEY=your_key_here node scripts/update-champions-league.js
   ```
3. Check `git diff data/` to see what changed.

The free tier allows 10 requests/minute, so running all three scripts back to back is well within limits.

### Running it on a schedule (already set up)

`.github/workflows/update-fixtures.yml` runs the EPL and Championship scripts once a day (04:00 UTC) via GitHub Actions, and commits any changed `data/*.json` files back to the repo in one commit. `.github/workflows/update-champions-league.yml` runs separately, once a week on Thursdays at 02:00 UTC — the Champions League calendar moves in matchdays roughly a month apart rather than a weekly domestic schedule, so a daily check would mostly find nothing to do. To enable either in your own repo:

1. Push this repo to GitHub (if not already).
2. Go to **Settings → Secrets and variables → Actions** and add a new repository secret named `FOOTBALL_DATA_API_KEY` with your key from football-data.org. Both workflows share the same secret.
3. That's it — they'll run automatically on their schedules. You can also trigger either manually any time from the **Actions** tab (both workflows have `workflow_dispatch` enabled).

No paid API, no server, no database beyond the JSON files themselves, no LLM calls in this pipeline.

### Adding a new team

If a club gets promoted/relegated (or, for the Champions League, qualifies/drops out of next season's league phase) and a script logs `Unrecognized team name`, add it to the `TEAM_NAME_TO_ID` mapping near the top of the relevant script and to the team list inside `index.html`.

Note: the Championship and Champions League team-name mappings were written from football-data.org's typical naming conventions rather than verified against a live API response, since no API key was available while building them. If several teams fail on the first real run, check the exact name in the error message against what's in the script and correct as needed — this is expected to need at most minor fixes, not a rewrite. The Champions League mapping also has a yearly maintenance cost the other two don't: the 36-team lineup is entirely different each season (new qualifiers, no promotion/relegation), so it's worth a quick pass over `TEAM_NAME_TO_ID` and `CHAMPIONS_LEAGUE_OTHER_TEAMS` each August once that season's league phase draw is confirmed.

### Carabao Cup (api-football.com)

The Carabao Cup uses a different source, [api-football.com](https://www.api-football.com/) (direct API, via [dashboard.api-football.com](https://dashboard.api-football.com/register) — **not** their separate RapidAPI marketplace listing, which uses a different host and a different key), since it draws from all 92 Premier League + EFL clubs and needed a provider with reliable EFL Cup coverage. `scripts/update-football-competition-api-football.js` mirrors the football-data.org shared logic above (same fetch → match → add/update → write pattern, same external-ID-with-date/team fallback matching), just against a different API shape; `update-carabao-cup.js` is the thin config file for it, same role as `update-epl.js`/`update-championship.js`.

Because the Cup includes League One and League Two clubs (not just PL/Championship sides), `update-carabao-cup.js`'s `TEAM_NAME_TO_ID` mapping is wider than the other two scripts', and `index.html`'s `SEED_TEAMS` had to gain a `CARABAO_CUP_OTHER_TEAMS` list to match — otherwise early-round fixtures involving lower-league clubs get logged as `Unrecognized team name` and silently skipped rather than crashing the whole run.

**Running it locally:**

1. Get a free API key: [dashboard.api-football.com/register](https://dashboard.api-football.com/register). Sign up there directly — don't use a RapidAPI key here, it'll fail with a `404 API doesn't exists` error, since RapidAPI's gateway doesn't recognize a direct api-sports.io key (and vice versa).
2. Run:
   ```
   API_FOOTBALL_KEY=your_key_here node scripts/update-carabao-cup.js
   ```
3. Check `git diff data/carabao-cup-events.json` to see what changed.

**Running it on a schedule (already set up):** `.github/workflows/update-carabao-cup.yml` runs once a day (04:00 UTC) and commits any change to `data/carabao-cup-events.json` back to the repo. To enable it, go to **Settings → Secrets and variables → Actions** and add a repository secret named `API_FOOTBALL_KEY` with your key. It's a separate workflow file from `update-fixtures.yml` because it hits a different provider with its own key and its own rate limit, not because of any need to stagger timing — both happen to run at 04:00 UTC.

If a script logs `Unrecognized team name from api-football.com`, add the team to `TEAM_NAME_TO_ID` near the top of `update-carabao-cup.js` **and** to `CARABAO_CUP_OTHER_TEAMS` (or `PL_TEAMS`/`CHAMPIONSHIP_TEAMS` if it belongs there instead) inside `index.html`, same as the "Adding a new team" process above. Note: `TEAM_NAME_TO_ID` here was written from api-football.com's typical short-form naming convention (e.g. "Brighton", not "Brighton & Hove Albion FC") rather than verified against a live response, since no API key was available while building it — check exact names in any error message against a real API response and adjust as needed.

**If the script instead reports 0 fixtures received (not an unrecognized-team error)** — that's a different problem than a team-mapping gap, and filling in missing teams won't fix it. That means the API call itself returned nothing, which per api-football.com's own docs can happen for a few reasons: the league ID is wrong (a 200 with an empty array looks identical to "correct ID, no data" — there's no error to tell them apart), the season value isn't covered on your plan tier, or — specific to cup competitions — that round's fixtures haven't been added to their database yet because the draw/pairings for it aren't finalized. Run `API_FOOTBALL_KEY=your_key_here node scripts/diagnose-api-football.js` to check your account's plan/season coverage and confirm league ID 48 is actually the Carabao Cup rather than guessing further blind.

### Cricket (cricsheet.org)

Cricket uses [cricsheet.org](https://cricsheet.org/), which is a different shape of source than the others: instead of an API you call per match, it publishes whole-competition **zip archives** (JSON, one file per match), covering that competition's full history. `scripts/cricsheet-common.js` holds the shared download → extract → filter → reconcile logic; `scripts/update-cricket.js` is a config array listing all 16 sources (men's + women's for: The Hundred, IPL/WPL, Vitality Blast, Test matches, ODIs, T20Is, the T20 World Cup, and the ODI World Cup) and runs them all in one go.

**Why this one's structured differently from the football scrapers:** Cricsheet's team names are already the plain display name (no "FC"/"AFC" guessing needed), so there's no per-competition `TEAM_NAME_TO_ID` mapping to maintain - team ids are derived directly as `cricket_team_${slug(name)}`, matching the convention `index.html` already used for the hand-seeded cricket events. Any team or season not seen before is automatically appended to `data/cricket-teams.json` / `data/cricket-seasons.json`, so nothing needs manual upkeep as new countries or franchises show up in the data. All 16 sources also share a single `data/cricket-events.json` rather than one file each, since there's no per-source team list to keep separate.

**Naming note:** there's no "Women's IPL" - the Indian women's T20 league is a separate competition, the Women's Premier League (WPL), mapped here under its own `wpl` competition id rather than paired with `ipl`.

**Filtering:** Cricsheet's data is ball-by-ball (every single delivery) - the scraper only reads the match-level `info` block from each file and discards the `innings`/delivery data entirely, since a viewing log has no use for it. What's kept: teams, date(s), season, venue, competition/event name, match result, toss winner+decision, and player of the match. See the full JSON schema at [cricsheet.org/format/json](https://cricsheet.org/format/json/) for everything available if more fields are wanted later - `toAppEvent()` in `cricsheet-common.js` is the one place that would need extending.

**Running it locally:**

```
node scripts/update-cricket.js                # all 16 sources
node scripts/update-cricket.js hundred_men     # just one, by key - useful while testing
```

Requires the `unzip` command on PATH (preinstalled on GitHub Actions' `ubuntu-latest` runners; on most Linux/macOS machines it's already there too). No API key needed - cricsheet.org's downloads are public, no auth required.

**Running it on a schedule (already set up):** `.github/workflows/update-cricket.yml` runs once a week (Sundays, 03:00 UTC) rather than daily - each run re-downloads full competition archives (some with thousands of matches) since Cricsheet doesn't offer an incremental/diff download, so a daily schedule would just be re-fetching the same data far more often than it actually changes.

### Tennis (stats.tennismylife.org)

Two other tennis sites were checked first and both turned out to be non-starters: [tennis-db.com](https://tennis-db.com/) and [tennisdata.app](https://tennisdata.app/) both explicitly prohibit automated/bulk data extraction in their own Terms of Service (tennisdata.app also has active bot detection and gates downloads behind a paid credit system). Neither is used here.

[stats.tennismylife.org](https://stats.tennismylife.org/) is the opposite situation: MIT-licensed, explicitly "free to use," and the site itself documents a bulk-download API (`GET /api/data-files`) along with copy-paste curl/PowerShell examples for scripted use - built for exactly this kind of thing. `scripts/tennis-common.js` holds the shared fetch/parse/reconcile logic; `scripts/update-tennis.js` runs both the ATP and WTA tours.

**Structure:** similar reasoning to the cricket scraper - hundreds of distinct players and tournaments make a hand-maintained mapping impractical, so player ids, tournament (competition) ids, and season ids are all auto-derived and auto-registered into `data/tennis-players.json`, `data/tennis-competitions.json`, and `data/tennis-seasons.json` respectively, the first time each is encountered. Each tournament becomes its own competition (e.g. "US Open (ATP)"), with each year of it a season - the same two-level model every other sport in this app already uses.

**Scope:** 2020 onward, per what was asked for, covering both tours' main draws. The site also has Challenger Tour and qualifying-round files available, not currently pulled in - easy to add in `update-tennis.js` if wanted later.

**Filtering:** this source's CSVs are already match-level (no ball-by-ball equivalent to strip), so there wasn't much to filter beyond dropping the serve/rally statistics columns (aces, break points, etc. - all present in the source if wanted later). Kept: both players, tournament, surface, round, score, result, and match duration when available.

**Known data limitation, not a bug:** the source only records each match's *tournament week* (`tourney_date`), not the specific day an individual match was played - every match within the same tournament shares one date. There's no way to get a precise per-match day/time from this data.

**Running it locally:**

```
node scripts/update-tennis.js       # both tours
node scripts/update-tennis.js atp   # just one, for testing
```

No API key needed.

**Running it on a schedule (already set up):** `.github/workflows/update-tennis.yml` runs daily at 00:00 UTC.

### Extending to other sources/sports

This was deliberately built for one source and one competition first, then extended to a second competition on the same source, then a third competition on a *different* source (api-football.com, for the Carabao Cup) to prove the shared-logic pattern holds up across providers too. The same overall pattern (fetch → parse → match by an external ID with a date/name fallback → add/update → write JSON → commit) can be repeated for F1, darts, or cricket, each as its own script and its own JSON file, added one at a time, against whichever data source best covers that sport.
