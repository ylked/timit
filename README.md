# Timit

A tiny local work-time tracker. One start/stop button, a live dashboard, a
calendar with weekly quotas, insights about when and how much you work, and
exports for HR (Excel, CSV, JSON). No accounts, no network calls — everything
lives in a single SQLite file at `data/timit.db`.

- **Today** — live timer (also in the header and tab title), backdated start
  ("forgot to start? 15 min ago"), weekly quota ring, day timeline, day-by-day bars.
- **Entries** — range presets, note search, entries grouped by day; add/edit in a
  dialog (an end time before the start means "next day"); delete with undo.
- **Calendar** — month view shaded by hours, ✓ on days submitted to HR, a week
  column with quota status. Click a week to change its quota (e.g. 0 for vacation).
- **Insights** — weekly hours vs quota, running balance, weekday averages, a
  weekday × hour heatmap, an activity grid, records and monthly totals.
- **Reports** — exports and the list of periods submitted to HR.
- **Settings** — default quota, light/dark/system theme, backup download.

Keyboard: `S` / `Space` start/stop, `N` new entry, `1`–`6` switch pages, `?` help.

## Stack

- `app.py` — Flask JSON API over SQLite (also serves the built UI).
- `web/` — Svelte 5 + TypeScript single-page app built with Vite into `web/dist`.
  No UI or chart libraries: native `<dialog>`, popover toasts, view transitions,
  and hand-drawn SVG charts.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cd web && npm install && npm run build   # builds the UI into web/dist (Node 20+)
```

## Run

```bash
source .venv/bin/activate
python3 app.py
```

Open http://localhost:5252 (set `PORT=xxxx` to use a different port, and
`TIMIT_DB=/path/to/file.db` to use a different database file).

## Develop

Run the API (`python3 app.py`) and, in another terminal, the UI with hot reload:

```bash
cd web && npm run dev    # http://localhost:5173, proxies /api to :5252
npm run check            # type-check
```

Backend tests (use a temporary database): `pip install pytest && pytest tests`.

## Run with Docker

```bash
docker compose up -d --build
```

The image builds the UI itself (multi-stage), so Node isn't needed on the host.

Open http://localhost:5252. Data is stored in a named Docker volume
(`timit-data`), not a bind-mounted host folder — SQLite needs real file
locking, which host bind mounts on Docker Desktop (Mac/Windows) don't reliably
provide and can cause `sqlite3.OperationalError: unable to open database file`.
The named volume survives rebuilds/`docker compose down`; it's only removed if
you run `docker compose down -v`.

Without compose:

```bash
docker build -t timit .
docker run -d -p 5252:5252 -v timit-data:/app/data --name timit timit
```

If you're on native Linux (no Docker Desktop virtualization layer) and want
the `.db` file directly accessible on the host instead, a bind mount works
fine there — replace the volume line with `./data:/app/data`.

## Data & backups

All data lives in a single SQLite file at `data/timit.db` (or inside the
`timit-data` Docker volume, when run via Docker). To back up:

- Click **Download full backup** in Settings (works the same whether
  running locally or in Docker), or
- Local run: copy `data/timit.db` somewhere safe (e.g. a synced Dropbox/iCloud folder).
- Docker run: `docker cp timit:/app/data/timit.db ./timit-backup.db`.

There's no server-side scheduling — the "backup" is just that one file.

## Exports

From the Reports page, for any date range (all entries as JSON are also in Settings):

- **Excel report** (`.xlsx`) — a "Daily Summary" sheet (one row per day) plus a
  "Raw Entries" sheet with every individual entry in range.
- **Raw CSV / JSON** — every entry as `id, start, end, duration, note`.

## Hourly rate

Set your hourly rate under **Settings → Hourly rate**. It's a dated history (a rate
applies from its date until the next change), so a raise doesn't rewrite past
pay. Gross amounts then appear in Insights (total earned, per week/month, the
balance in money) and Reports (range preview, unsubmitted hours, current pay
period, submitted periods). Amounts are only shown in the app, never added to
exported files.

## HR timesheet template

If HR gives you their own Excel file to fill in (rows like `15.09.26 to 14.10.26`
with a deadline and a **Working Hours** column), upload it under
**Settings → HR timesheet template**. It's stored next to the database as
`data/hr_template.xlsx`. Reports then offers **HR timesheet (.xlsx)**: the same
file, same name, with Working Hours (decimal hours, e.g. `45.33`) filled in for
every pay period that starts on or before the export's end date. Nothing else
in the file is changed. Reports also shows the current pay period and its
deadline, and offers the HR periods as quick ranges. Upload next year's file
to replace it.

## Submitting to HR (pay periods)

The Reports page keeps track of which date ranges you've already handed to HR:

- With **"Mark this range as submitted to HR"** ticked, exporting also saves the
  range as a submitted period. Untick it to export without marking anything.
- The banner shows how many hours aren't in any submitted period yet, and offers
  the next range (the day after your last period up to the end of that month).
- Under **Submitted to HR** you can add, edit, or delete periods, or download
  a period's Excel report again. Periods can't overlap.
- If entries inside a submitted period change afterwards, the period shows
  `⚠ now …` with the new total. You can accept the new total in its edit dialog.
- Days in a submitted period have a ✓ in the calendar.
