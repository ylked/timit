# Timit

A tiny local work-time tracker. One start/stop button, day/week/calendar views,
editable entries, and exports (Excel, CSV, JSON). No accounts, no network calls —
everything lives in a single SQLite file at `data/timit.db`.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
source .venv/bin/activate
python3 app.py
```

Open http://localhost:5252 (set `PORT=xxxx` to use a different port).

## Data & backups

All data lives in `data/timit.db` (a single SQLite file). To back up, either:

- Click **Download Full Backup** on the Export tab, or
- Just copy `data/timit.db` somewhere safe (e.g. a synced Dropbox/iCloud folder).

There's no server-side scheduling — the "backup" is just that one file.

## Exports

From the Export tab, for any date range (or all time if left blank):

- **Excel report** (`.xlsx`) — a "Daily Summary" sheet (one row per day) plus a
  "Raw Entries" sheet with every individual entry in range.
- **Raw CSV / JSON** — every entry as `id, start, end, duration, note`.
