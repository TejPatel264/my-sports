# SportLog

A personal sports-viewing archive. Single-page app, local-first (IndexedDB via Dexie), no backend for the app itself.

## Project structure

```
index.html                          the app (still one file for now - CSS/JS split is a planned follow-up)
data/
  epl-events.json                   Premier League fixtures/results
  championship-events.json          EFL Championship fixtures/results
scripts/
  update-football-competition.js    shared fetch/match/write logic, used by both scripts below
  update-epl.js                     configures the shared logic for the Premier League (PL)
  update-championship.js            configures the shared logic for the Championship (ELC)
  package.json
.github/workflows/
  update-fixtures.yml               runs both scripts once a day via GitHub Actions
```

All other sports (F1, darts, cricket, tournament archive) are still defined inline in `index.html`. Premier League was split out first as the proof of concept for the update-script approach, Championship followed the same pattern; other sports can move to their own JSON files + scripts the same way, one at a time.

## Running the app

Needs to be served over HTTP, not opened directly as a `file://` URL — the app fetches the `data/*.json` files at load time, and browsers block that kind of fetch from a local file for security reasons. GitHub Pages serves it correctly. For local testing:

```
python3 -m http.server 8080
# then open http://localhost:8080/
```

## Keeping fixture data up to date

`scripts/update-football-competition.js` holds the shared logic; `update-epl.js` and `update-championship.js` are thin config files that point it at a specific competition:

1. Fetches matches from [football-data.org](https://www.football-data.org) (free tier, no cost — Premier League and Championship are both on the always-free competition list).
2. Matches them against what's already in the relevant `data/*.json` file — first by an internal ID the script attaches to each event once matched, falling back to team-pair + date for anything not yet matched (i.e. the first run against pre-existing or empty data).
3. Adds new fixtures it hasn't seen, updates existing ones (kickoff time moved, venue confirmed, result posted), and leaves everything else untouched.
4. Writes the file back only if something actually changed.

`data/championship-events.json` starts as an empty array (`[]`) — unlike EPL, which had an initial hand-sourced set of fixtures, Championship is a genuine test of the script populating a competition from nothing.

### Running it locally

1. Get a free API key: [football-data.org/client/register](https://www.football-data.org/client/register).
2. Run either or both:
   ```
   FOOTBALL_DATA_API_KEY=your_key_here node scripts/update-epl.js
   FOOTBALL_DATA_API_KEY=your_key_here node scripts/update-championship.js
   ```
3. Check `git diff data/` to see what changed.

The free tier allows 10 requests/minute, so running both scripts back to back is well within limits.

### Running it on a schedule (already set up)

`.github/workflows/update-fixtures.yml` runs both scripts once a day (06:00 UTC) via GitHub Actions, and commits any changed `data/*.json` files back to the repo in one commit. To enable it in your own repo:

1. Push this repo to GitHub (if not already).
2. Go to **Settings → Secrets and variables → Actions** and add a new repository secret named `FOOTBALL_DATA_API_KEY` with your key from football-data.org.
3. That's it — it'll run automatically on the schedule. You can also trigger it manually any time from the **Actions** tab (the workflow has `workflow_dispatch` enabled).

No paid API, no server, no database beyond the JSON files themselves, no LLM calls in this pipeline.

### Adding a new team

If a club gets promoted/relegated and a script logs `Unrecognized team name from football-data.org`, add it to the `TEAM_NAME_TO_ID` mapping near the top of the relevant script (`update-epl.js` or `update-championship.js`) and to the team list inside `index.html`.

Note: the Championship team-name mapping was written from football-data.org's documented naming convention (` FC`/` AFC` suffixes, matching what's confirmed for the Premier League script) rather than verified against a live API response, since no API key was available while building it. If several teams fail on the first real run, check the exact name in the error message against what's in `update-championship.js` and correct as needed — this is expected to need at most minor fixes, not a rewrite.

### Extending to other sources/sports

This was deliberately built for one source and one competition first, then extended to a second competition on the same source to prove the shared-logic approach holds up. The same pattern (fetch → parse → match by an external ID with a date/name fallback → add/update → write JSON → commit) can be repeated for F1, darts, or cricket, each as its own script and its own JSON file, added one at a time — likely against different data sources, since football-data.org is football-only.
