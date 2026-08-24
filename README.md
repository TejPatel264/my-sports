# SportLog

A personal sports-viewing archive. Single-page app, local-first (IndexedDB via Dexie), no backend for the app itself.

## Project structure

```
index.html                     the app (still one file for now - CSS/JS split is a planned follow-up)
data/
  epl-events.json               Premier League fixtures/results, kept up to date by the scheduled script below
scripts/
  update-epl.js                 fetches PL data from football-data.org and updates data/epl-events.json
  package.json
.github/workflows/
  update-epl.yml                runs update-epl.js once a day via GitHub Actions
```

All other sports (F1, darts, cricket, tournament archive) are still defined inline in `index.html`. Premier League was split out first as the proof of concept for the update-script approach; other sports can move to their own JSON files + scripts the same way, one at a time.

## Running the app

Needs to be served over HTTP, not opened directly as a `file://` URL — the app fetches `data/epl-events.json` at load time, and browsers block that kind of fetch from a local file for security reasons. GitHub Pages serves it correctly. For local testing:

```
python3 -m http.server 8080
# then open http://localhost:8080/
```

## Keeping Premier League data up to date

`scripts/update-epl.js` is an MVP for one source, one competition:

1. Fetches Premier League matches from [football-data.org](https://www.football-data.org) (free tier, no cost).
2. Matches them against what's already in `data/epl-events.json` — first by an internal ID the script attaches to each event once matched, falling back to team-pair + date for anything not yet matched (i.e. the very first run against the app's original seed data).
3. Adds new fixtures it hasn't seen, updates existing ones (kickoff time moved, venue confirmed, result posted), and leaves everything else untouched.
4. Writes the file back only if something actually changed.

### Running it locally

1. Get a free API key: [football-data.org/client/register](https://www.football-data.org/client/register).
2. Run:
   ```
   FOOTBALL_DATA_API_KEY=your_key_here node scripts/update-epl.js
   ```
3. Check `git diff data/epl-events.json` to see what changed.

### Running it on a schedule (already set up)

`.github/workflows/update-epl.yml` runs the same script once a day (06:00 UTC) via GitHub Actions, and commits `data/epl-events.json` back to the repo if anything changed. To enable it in your own repo:

1. Push this repo to GitHub (if not already).
2. Go to **Settings → Secrets and variables → Actions** and add a new repository secret named `FOOTBALL_DATA_API_KEY` with your key from football-data.org.
3. That's it — it'll run automatically on the schedule. You can also trigger it manually any time from the **Actions** tab (the workflow has `workflow_dispatch` enabled).

No paid API, no server, no database beyond the JSON file itself, no LLM calls in this pipeline.

### Adding a new team

If a club gets promoted/relegated and the script logs `Unrecognized team name from football-data.org`, add it to the `TEAM_NAME_TO_ID` mapping near the top of `scripts/update-epl.js` and to the team list inside `index.html`.

### Extending to other sources/sports

This was deliberately built for one source and one competition first. Once it's proven reliable, the same pattern (fetch → parse → match by an external ID with a date/name fallback → add/update → write JSON → commit) can be repeated for F1, darts, or cricket, each as its own script and its own JSON file, added one at a time.
