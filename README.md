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

## Run with Docker

```bash
docker compose up -d --build
```

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

- Click **Download Full Backup** on the Export tab (works the same whether
  running locally or in Docker), or
- Local run: copy `data/timit.db` somewhere safe (e.g. a synced Dropbox/iCloud folder).
- Docker run: `docker cp timit:/app/data/timit.db ./timit-backup.db`.

There's no server-side scheduling — the "backup" is just that one file.

## Exports

From the Export tab, for any date range (or all time if left blank):

- **Excel report** (`.xlsx`) — a "Daily Summary" sheet (one row per day) plus a
  "Raw Entries" sheet with every individual entry in range.
- **Raw CSV / JSON** — every entry as `id, start, end, duration, note`.
