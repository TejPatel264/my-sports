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
scripts/
  update-football-competition.js               shared fetch/match/write logic (football-data.org), used by the three scripts below
  update-epl.js                                configures the shared logic for the Premier League (PL)
  update-championship.js                       configures the shared logic for the Championship (ELC)
  update-champions-league.js                   configures the shared logic for the Champions League (CL)
  update-football-competition-api-football.js  shared fetch/match/write logic (api-football.com), used by update-carabao-cup.js
  update-carabao-cup.js                        configures the shared logic for the Carabao Cup
  package.json
.github/workflows/
  update-fixtures.yml               runs the daily football-data.org scripts (PL, Championship) once a day
  update-champions-league.yml       runs the Champions League scraper once a week, Thursdays 02:00 UTC
  update-carabao-cup.yml            runs the Carabao Cup scraper once a day via GitHub Actions
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

### Extending to other sources/sports

This was deliberately built for one source and one competition first, then extended to a second competition on the same source, then a third competition on a *different* source (api-football.com, for the Carabao Cup) to prove the shared-logic pattern holds up across providers too. The same overall pattern (fetch → parse → match by an external ID with a date/name fallback → add/update → write JSON → commit) can be repeated for F1, darts, or cricket, each as its own script and its own JSON file, added one at a time, against whichever data source best covers that sport.
