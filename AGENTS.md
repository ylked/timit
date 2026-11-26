# AGENTS.md

Notes for coding agents working on Timit, a single-user, local work-time tracker.
Read `README.md` for what the app does from the user's side.

## Layout

- `app.py`: the whole backend. A Flask JSON API under `/api/*` over SQLite. It also
  serves the built UI from `web/dist`: `/` is `index.html`, `/assets/*` is cached as
  immutable, and any other path falls back to the SPA. An unknown `/api/*` path
  returns a JSON 404.
- `web/`: the frontend, Svelte 5 + TypeScript, built with Vite into `web/dist`
  (gitignored).
  - `src/lib/api.ts`: the typed API client and all response types. When an
    endpoint changes, update it here too.
  - `src/lib/state.svelte.ts`: shared state. It holds the timer, `data.version`
    with `invalidate()`, toasts, the entry editor and recent notes.
  - `src/lib/router.svelte.ts`: hash router, with keys 1–6 switching pages.
    Page changes run inside a View Transition that waits for API requests to
    finish (`whenIdle`).
  - `src/lib/time.ts`: date helpers and all formatting (durations, money, dates).
  - `src/lib/views/`: one component per page (Today, Entries, Calendar,
    Insights, Reports, Settings).
  - `src/lib/components/`: dialogs, the entry list, toasts, the tooltip, etc.
  - `src/lib/charts/`: hand-drawn SVG charts.
- `tests/test_api.py`: pytest API tests. The fixture points `TIMIT_DB` at a temp
  file and reloads `app`.
- `data/`: the live database (`timit.db`) and the uploaded HR template
  (`hr_template.xlsx`). This is real user data. It's gitignored; never commit,
  overwrite or delete it.

## Commands

```bash
source .venv/bin/activate && pytest tests        # backend tests
cd web && npm run check                          # svelte-check (must report 0 errors)
cd web && npm run build                          # build the UI into web/dist
cd web && npm run dev                            # Vite on :5173, proxies /api to :5252
python3 app.py                                   # API + built UI on :5252
docker compose up -d --build                     # production: rebuilds the UI inside the image
```

The deployed instance is the docker compose service on port 5252, with `./data`
bind-mounted to `/app/data`. To try out a change, run a separate `app.py` with
`PORT` and `TIMIT_DB` set to a scratch copy rather than touching the live
database. If you must rebuild the container, check first whether a timer is
running (`GET /api/timer/status`). Rebuilding keeps it, but don't stop it.

## Conventions

### Time and dates

- Timestamps are stored as naive local ISO strings, e.g. `2026-11-20T13:30:00`,
  in Europe/Zurich time.
- `end_ts` is NULL while the timer is running.
- Dates are `YYYY-MM-DD`.
- Weeks start on Monday.
- On the frontend, never use `toISOString()` (it's UTC). Use `isoDate`,
  `isoLocal` and `parseLocal` from `time.ts`.

### Aggregation

- Do aggregation on the server: split entries by day (`split_by_day`) or by
  hour (`split_by_hour`).
- Running entries count up to "now".

### Schema

- Tables are created with `CREATE TABLE IF NOT EXISTS` in `init_db()`. There
  are no migrations.
- A new column needs a guarded `ALTER TABLE` so that existing databases
  keep working.
- Simple key/value config goes in the `settings` table.

### Validation

- Validate input in the endpoint and return `{"error": "..."}` with status 400.
- The UI shows that error message as-is, so write it for the user.

### Svelte 5

- Use runes (`$state`, `$derived`, `$effect`, `$props`). Don't use legacy
  `export let`/stores.
- In a dialog's "load initial values" effect, wrap the body in `untrack`.
  Otherwise the effect re-runs on its own writes.
- After a mutation, call `invalidate()` so that views refetch.
- Attribute values that contain `{}` must be written as expressions, e.g.
  `pattern={"[A-Za-z]{3}"}`.
- Don't name a variable `state`: it clashes with the `$state` rune.

### UI dependencies

- There are no UI, chart or CSS libraries; keep it that way.
- Use the platform instead: native `<dialog>`, `popover`, View Transitions,
  `light-dark()` colour tokens in `app.css`, and container/media queries.

### Charts

- Charts are hand-drawn SVG, built to these specs:
  - thin bars (at most 24px) with 4px rounded ends;
  - hairline grid lines;
  - hover tooltips through the shared `Tooltip.svelte` (`showTip`/`hideTip`);
  - a "Show as table" fallback.
- Use the colour tokens (`--accent`, `--seq-*`, `--good`/`--bad`/`--warn`),
  never hard-coded colours.

### Mobile

- The nav becomes a bottom bar under 720px.
- Check both light and dark themes, and mobile width, after a visual change.

### Money

- Pay is gross, computed per day from the dated history in `hourly_rates`
  (`earned()`/`range_earned()`).
- Pay is shown only in the app. Never add it to exported files (Excel, CSV,
  JSON, HR template).

### HR template export

- The HR export fills the user's uploaded workbook with openpyxl
  (load → set cells → save) so that its formatting survives.
- Only the Working Hours cells are written, as decimal hours rounded to 2
  places.

## Before you're done

1. `pytest tests` passes. Add a test for new or changed API behaviour.
2. `npm run check` reports 0 errors and `npm run build` succeeds.
3. For UI changes, load the page and check there are no console errors.
4. Keep `README.md` in step with user-visible changes.
5. Commit messages are a short imperative subject. Committing directly on
   `main` and pushing is fine for this repo.
