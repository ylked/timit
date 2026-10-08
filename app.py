import csv
import io
import json
import os
import sqlite3
from calendar import monthrange
from datetime import date, datetime, timedelta
from pathlib import Path

from flask import Flask, g, jsonify, render_template, request, send_file

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "timit.db"

app = Flask(__name__)


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_ts TEXT NOT NULL,
            end_ts TEXT,
            note TEXT DEFAULT ''
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS pay_periods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            exported_at TEXT NOT NULL,
            seconds REAL NOT NULL DEFAULT 0,
            note TEXT DEFAULT ''
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS week_quotas (
            week_start TEXT PRIMARY KEY,
            hours REAL NOT NULL,
            note TEXT DEFAULT ''
        )
        """
    )
    db.commit()
    db.close()


# ---------- helpers ----------

def now_iso():
    return datetime.now().replace(microsecond=0).isoformat()


def parse_iso(s):
    return datetime.fromisoformat(s)


def normalize_iso(s):
    return datetime.fromisoformat(s).replace(microsecond=0).isoformat()


def effective_end(row):
    if row["end_ts"] is None:
        return datetime.now().replace(microsecond=0)
    return parse_iso(row["end_ts"])


def seconds_to_hhmm(secs):
    secs = int(round(secs))
    h, rem = divmod(secs, 3600)
    m, _ = divmod(rem, 60)
    return f"{h:02d}:{m:02d}"


def overlapping_entries(db, range_start, range_end):
    return db.execute(
        "SELECT * FROM entries WHERE start_ts < ? AND (end_ts IS NULL OR end_ts > ?) ORDER BY start_ts",
        (range_end.isoformat(), range_start.isoformat()),
    ).fetchall()


def split_by_day(start_dt, end_dt):
    cur = start_dt
    while cur < end_dt:
        day_end = datetime.combine(cur.date() + timedelta(days=1), datetime.min.time())
        chunk_end = min(end_dt, day_end)
        yield cur.date(), (chunk_end - cur).total_seconds()
        cur = chunk_end


def daily_totals(db, start_date, end_date):
    range_start = datetime.combine(start_date, datetime.min.time())
    range_end = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
    rows = overlapping_entries(db, range_start, range_end)
    totals = {}
    for row in rows:
        s = max(parse_iso(row["start_ts"]), range_start)
        e = min(effective_end(row), range_end)
        for d, secs in split_by_day(s, e):
            totals[d] = totals.get(d, 0) + secs
    return totals


def resolve_range(db, start_s, end_s):
    if start_s and end_s:
        return date.fromisoformat(start_s), date.fromisoformat(end_s)
    row = db.execute("SELECT MIN(start_ts) AS mn, MAX(start_ts) AS mx FROM entries").fetchone()
    if row["mn"] is None:
        today = date.today()
        return today, today
    mn = parse_iso(row["mn"]).date()
    mx = parse_iso(row["mx"]).date()
    return (date.fromisoformat(start_s) if start_s else mn, date.fromisoformat(end_s) if end_s else mx)


def get_entries_in_range(db, start_date, end_date):
    range_start = datetime.combine(start_date, datetime.min.time())
    range_end = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
    return overlapping_entries(db, range_start, range_end)


# ---------- pages ----------

@app.get("/")
def index():
    return render_template("index.html")


# ---------- timer ----------

@app.get("/api/timer/status")
def timer_status():
    db = get_db()
    row = db.execute("SELECT * FROM entries WHERE end_ts IS NULL ORDER BY id DESC LIMIT 1").fetchone()
    if row is None:
        return jsonify({"running": False})
    return jsonify({"running": True, "entry": dict(row)})


@app.post("/api/timer/start")
def timer_start():
    db = get_db()
    if db.execute("SELECT id FROM entries WHERE end_ts IS NULL").fetchone() is not None:
        return jsonify({"error": "A timer is already running"}), 409
    note = (request.get_json(silent=True) or {}).get("note", "")
    cur = db.execute("INSERT INTO entries (start_ts, end_ts, note) VALUES (?, NULL, ?)", (now_iso(), note))
    db.commit()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(row))


@app.post("/api/timer/stop")
def timer_stop():
    db = get_db()
    row = db.execute("SELECT * FROM entries WHERE end_ts IS NULL ORDER BY id DESC LIMIT 1").fetchone()
    if row is None:
        return jsonify({"error": "No timer is running"}), 409
    db.execute("UPDATE entries SET end_ts = ? WHERE id = ?", (now_iso(), row["id"]))
    db.commit()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (row["id"],)).fetchone()
    return jsonify(dict(row))


# ---------- entries (CRUD) ----------

@app.get("/api/entries")
def list_entries():
    start_s = request.args.get("start")
    end_s = request.args.get("end")
    db = get_db()
    if start_s or end_s:
        start_date, end_date = resolve_range(db, start_s, end_s)
        rows = get_entries_in_range(db, start_date, end_date)
    else:
        rows = db.execute("SELECT * FROM entries ORDER BY start_ts DESC").fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/entries")
def create_entry():
    data = request.get_json()
    start_ts = normalize_iso(data["start_ts"])
    end_ts = normalize_iso(data["end_ts"]) if data.get("end_ts") else None
    note = data.get("note", "")
    if end_ts and end_ts <= start_ts:
        return jsonify({"error": "End must be after start"}), 400
    db = get_db()
    if end_ts is None and db.execute("SELECT id FROM entries WHERE end_ts IS NULL").fetchone() is not None:
        return jsonify({"error": "A timer is already running"}), 409
    cur = db.execute("INSERT INTO entries (start_ts, end_ts, note) VALUES (?, ?, ?)", (start_ts, end_ts, note))
    db.commit()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(row))


@app.put("/api/entries/<int:entry_id>")
def update_entry(entry_id):
    data = request.get_json()
    db = get_db()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Not found"}), 404
    start_ts = normalize_iso(data["start_ts"]) if data.get("start_ts") else row["start_ts"]
    end_ts = (normalize_iso(data["end_ts"]) if data.get("end_ts") else None) if "end_ts" in data else row["end_ts"]
    note = data.get("note", row["note"])
    if end_ts and end_ts <= start_ts:
        return jsonify({"error": "End must be after start"}), 400
    db.execute("UPDATE entries SET start_ts=?, end_ts=?, note=? WHERE id=?", (start_ts, end_ts, note, entry_id))
    db.commit()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    return jsonify(dict(row))


@app.delete("/api/entries/<int:entry_id>")
def delete_entry(entry_id):
    db = get_db()
    db.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
    db.commit()
    return jsonify({"ok": True})


# ---------- summaries ----------

@app.get("/api/summary/day")
def summary_day():
    db = get_db()
    start_date, end_date = resolve_range(db, request.args.get("start"), request.args.get("end"))
    totals = daily_totals(db, start_date, end_date)
    result = []
    d = start_date
    while d <= end_date:
        result.append({"date": d.isoformat(), "seconds": totals.get(d, 0)})
        d += timedelta(days=1)
    return jsonify(result)


@app.get("/api/summary/week")
def summary_week():
    db = get_db()
    start_date, end_date = resolve_range(db, request.args.get("start"), request.args.get("end"))
    totals = daily_totals(db, start_date, end_date)
    weeks = {}
    d = start_date
    while d <= end_date:
        week_start = d - timedelta(days=d.weekday())
        weeks[week_start] = weeks.get(week_start, 0) + totals.get(d, 0)
        d += timedelta(days=1)
    result = [{"week_start": ws.isoformat(), "seconds": secs} for ws, secs in sorted(weeks.items())]
    return jsonify(result)


@app.get("/api/calendar")
def calendar_view():
    year = int(request.args.get("year"))
    month = int(request.args.get("month"))
    start_date = date(year, month, 1)
    end_date = date(year, month, monthrange(year, month)[1])
    db = get_db()
    totals = daily_totals(db, start_date, end_date)
    return jsonify({d.isoformat(): secs for d, secs in totals.items()})


# ---------- weekly quota ----------

DEFAULT_WEEKLY_QUOTA_HOURS = 15.0


def week_start_of(d):
    return d - timedelta(days=d.weekday())


def get_setting(db, key, default=None):
    row = db.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(db, key, value):
    db.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )


def quota_settings(db):
    start_s = get_setting(db, "quota_start_date")
    if start_s:
        start = date.fromisoformat(start_s)
    else:
        # Default to the week of the first recorded entry (or this week if there are none).
        row = db.execute("SELECT MIN(start_ts) AS mn FROM entries").fetchone()
        start = week_start_of(parse_iso(row["mn"]).date() if row["mn"] else date.today())
    return {
        "weekly_hours": float(get_setting(db, "weekly_quota_hours", DEFAULT_WEEKLY_QUOTA_HOURS)),
        "start_date": start.isoformat(),
        "start_date_is_default": start_s is None,
    }


def quota_weeks(db, first_week, last_week):
    """Per-week worked seconds and quota for the weeks starting first_week..last_week (Mondays)."""
    settings = quota_settings(db)
    quota_start = week_start_of(date.fromisoformat(settings["start_date"]))
    overrides = {
        r["week_start"]: r
        for r in db.execute(
            "SELECT * FROM week_quotas WHERE week_start BETWEEN ? AND ?",
            (first_week.isoformat(), last_week.isoformat()),
        ).fetchall()
    }
    totals = daily_totals(db, first_week, last_week + timedelta(days=6))
    current_week = week_start_of(date.today())
    weeks = []
    ws = first_week
    while ws <= last_week:
        override = overrides.get(ws.isoformat())
        if override is not None:
            quota_hours = override["hours"]
        elif ws >= quota_start:
            quota_hours = settings["weekly_hours"]
        else:
            quota_hours = None  # before tracking started: no quota
        weeks.append({
            "week_start": ws.isoformat(),
            "seconds": sum(totals.get(ws + timedelta(days=i), 0) for i in range(7)),
            "quota_hours": quota_hours,
            "is_override": override is not None,
            "note": override["note"] if override is not None else "",
            "state": "past" if ws < current_week else "current" if ws == current_week else "future",
        })
        ws += timedelta(days=7)
    return weeks


@app.get("/api/quota/settings")
def get_quota_settings():
    return jsonify(quota_settings(get_db()))


@app.put("/api/quota/settings")
def update_quota_settings():
    data = request.get_json() or {}
    db = get_db()
    if "weekly_hours" in data:
        try:
            hours = float(data["weekly_hours"])
        except (TypeError, ValueError):
            return jsonify({"error": "Weekly hours must be a number"}), 400
        if hours < 0:
            return jsonify({"error": "Weekly hours must not be negative"}), 400
        set_setting(db, "weekly_quota_hours", hours)
    if "start_date" in data:
        if data["start_date"]:
            try:
                date.fromisoformat(data["start_date"])
            except (TypeError, ValueError):
                return jsonify({"error": "Invalid start date"}), 400
            set_setting(db, "quota_start_date", data["start_date"])
        else:
            db.execute("DELETE FROM settings WHERE key = 'quota_start_date'")
    db.commit()
    return jsonify(quota_settings(db))


@app.get("/api/quota/weeks")
def list_quota_weeks():
    db = get_db()
    try:
        start_date = date.fromisoformat(request.args["start"])
        end_date = date.fromisoformat(request.args["end"])
    except (KeyError, ValueError):
        return jsonify({"error": "start and end are required"}), 400
    return jsonify(quota_weeks(db, week_start_of(start_date), week_start_of(end_date)))


@app.put("/api/quota/weeks/<week>")
def set_week_quota(week):
    data = request.get_json() or {}
    try:
        ws = week_start_of(date.fromisoformat(week))
        hours = float(data["hours"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Hours must be a number"}), 400
    if hours < 0:
        return jsonify({"error": "Hours must not be negative"}), 400
    db = get_db()
    db.execute(
        "INSERT INTO week_quotas (week_start, hours, note) VALUES (?, ?, ?) "
        "ON CONFLICT(week_start) DO UPDATE SET hours = excluded.hours, note = excluded.note",
        (ws.isoformat(), hours, data.get("note", "")),
    )
    db.commit()
    return jsonify(quota_weeks(db, ws, ws)[0])


@app.delete("/api/quota/weeks/<week>")
def reset_week_quota(week):
    try:
        ws = week_start_of(date.fromisoformat(week))
    except ValueError:
        return jsonify({"error": "Invalid week"}), 400
    db = get_db()
    db.execute("DELETE FROM week_quotas WHERE week_start = ?", (ws.isoformat(),))
    db.commit()
    return jsonify(quota_weeks(db, ws, ws)[0])


@app.get("/api/quota/balance")
def quota_balance():
    """Over/under time from the quota start date up to today.

    Completed weeks count in full. The current week is reported separately, since its
    quota can't be missed until the week is over.
    """
    db = get_db()
    settings = quota_settings(db)
    current_week = week_start_of(date.today())
    first_week = week_start_of(date.fromisoformat(settings["start_date"]))
    balance = 0
    worked = 0
    quota = 0
    if first_week < current_week:
        for w in quota_weeks(db, first_week, current_week - timedelta(days=7)):
            if w["quota_hours"] is None:
                continue
            worked += w["seconds"]
            quota += w["quota_hours"] * 3600
        balance = worked - quota
    this_week = quota_weeks(db, current_week, current_week)[0]
    return jsonify({
        "settings": settings,
        "balance_seconds": balance,
        "worked_seconds": worked,
        "quota_seconds": quota,
        "current_week": this_week,
    })


# ---------- pay periods (ranges submitted to HR) ----------

def range_seconds(db, start_date, end_date):
    return sum(daily_totals(db, start_date, end_date).values())


def overlapping_period(db, start_date, end_date, exclude_id=None):
    return db.execute(
        "SELECT * FROM pay_periods WHERE start_date <= ? AND end_date >= ? AND id IS NOT ? ORDER BY start_date LIMIT 1",
        (end_date.isoformat(), start_date.isoformat(), exclude_id),
    ).fetchone()


def validate_period(db, data, exclude_id=None):
    """Returns (start_date, end_date, error_response)."""
    try:
        start_date = date.fromisoformat(data["start_date"])
        end_date = date.fromisoformat(data["end_date"])
    except (KeyError, TypeError, ValueError):
        return None, None, (jsonify({"error": "Start and end dates are required"}), 400)
    if end_date < start_date:
        return None, None, (jsonify({"error": "End date must not be before start date"}), 400)
    clash = overlapping_period(db, start_date, end_date, exclude_id)
    if clash is not None:
        msg = f"Overlaps the period {clash['start_date']} – {clash['end_date']} that is already marked as submitted"
        return None, None, (jsonify({"error": msg}), 409)
    return start_date, end_date, None


def period_dict(db, row):
    d = dict(row)
    d["current_seconds"] = range_seconds(db, date.fromisoformat(row["start_date"]), date.fromisoformat(row["end_date"]))
    return d


@app.get("/api/periods")
def list_periods():
    db = get_db()
    rows = db.execute("SELECT * FROM pay_periods ORDER BY start_date DESC").fetchall()
    periods = [period_dict(db, r) for r in rows]
    today = date.today()

    # Hours on days not covered by any period.
    unsubmitted = {"seconds": 0, "start": None, "end": None}
    bounds = db.execute("SELECT MIN(start_ts) AS mn, MAX(COALESCE(end_ts, start_ts)) AS mx FROM entries").fetchone()
    if bounds["mn"] is not None:
        first = parse_iso(bounds["mn"]).date()
        last = max(parse_iso(bounds["mx"]).date(), today)
        covered = [(date.fromisoformat(r["start_date"]), date.fromisoformat(r["end_date"])) for r in rows]
        for d, secs in daily_totals(db, first, last).items():
            if secs > 0 and not any(s <= d <= e for s, e in covered):
                unsubmitted["seconds"] += secs
                unsubmitted["start"] = min(unsubmitted["start"] or d, d)
                unsubmitted["end"] = max(unsubmitted["end"] or d, d)
        for key in ("start", "end"):
            if unsubmitted[key]:
                unsubmitted[key] = unsubmitted[key].isoformat()

    # Suggested next range: the day after the latest period up to the end of that month.
    suggested = None
    if rows:
        start = max(date.fromisoformat(r["end_date"]) for r in rows) + timedelta(days=1)
    elif bounds["mn"] is not None:
        start = parse_iso(bounds["mn"]).date()
    else:
        start = None
    if start is not None and start <= today:
        month_end = date(start.year, start.month, monthrange(start.year, start.month)[1])
        suggested = {"start": start.isoformat(), "end": min(month_end, today).isoformat()}

    return jsonify({"periods": periods, "unsubmitted": unsubmitted, "suggested": suggested})


@app.post("/api/periods")
def create_period():
    data = request.get_json() or {}
    db = get_db()
    start_date, end_date, err = validate_period(db, data)
    if err:
        return err
    exported_at = normalize_iso(data["exported_at"]) if data.get("exported_at") else now_iso()
    cur = db.execute(
        "INSERT INTO pay_periods (start_date, end_date, exported_at, seconds, note) VALUES (?, ?, ?, ?, ?)",
        (start_date.isoformat(), end_date.isoformat(), exported_at, range_seconds(db, start_date, end_date), data.get("note", "")),
    )
    db.commit()
    row = db.execute("SELECT * FROM pay_periods WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(period_dict(db, row))


@app.put("/api/periods/<int:period_id>")
def update_period(period_id):
    data = request.get_json() or {}
    db = get_db()
    row = db.execute("SELECT * FROM pay_periods WHERE id = ?", (period_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Not found"}), 404
    merged = {"start_date": data.get("start_date") or row["start_date"], "end_date": data.get("end_date") or row["end_date"]}
    start_date, end_date, err = validate_period(db, merged, exclude_id=period_id)
    if err:
        return err
    exported_at = normalize_iso(data["exported_at"]) if data.get("exported_at") else row["exported_at"]
    note = data.get("note", row["note"])
    range_changed = (start_date.isoformat(), end_date.isoformat()) != (row["start_date"], row["end_date"])
    seconds = range_seconds(db, start_date, end_date) if range_changed or data.get("resync") else row["seconds"]
    db.execute(
        "UPDATE pay_periods SET start_date=?, end_date=?, exported_at=?, seconds=?, note=? WHERE id=?",
        (start_date.isoformat(), end_date.isoformat(), exported_at, seconds, note, period_id),
    )
    db.commit()
    row = db.execute("SELECT * FROM pay_periods WHERE id = ?", (period_id,)).fetchone()
    return jsonify(period_dict(db, row))


@app.delete("/api/periods/<int:period_id>")
def delete_period(period_id):
    db = get_db()
    db.execute("DELETE FROM pay_periods WHERE id = ?", (period_id,))
    db.commit()
    return jsonify({"ok": True})


# ---------- exports ----------

@app.get("/api/export/xlsx")
def export_xlsx():
    from openpyxl import Workbook
    from openpyxl.styles import Font

    db = get_db()
    start_date, end_date = resolve_range(db, request.args.get("start"), request.args.get("end"))
    totals = daily_totals(db, start_date, end_date)
    rows = get_entries_in_range(db, start_date, end_date)

    entry_counts = {}
    for row in rows:
        d = parse_iso(row["start_ts"]).date()
        entry_counts[d] = entry_counts.get(d, 0) + 1

    wb = Workbook()
    ws = wb.active
    ws.title = "Daily Summary"
    header_font = Font(bold=True)
    ws.append(["Date", "Weekday", "Total Hours", "Total (HH:MM)", "Entries"])
    for cell in ws[1]:
        cell.font = header_font

    d = start_date
    total_seconds = 0
    total_entries = 0
    while d <= end_date:
        secs = totals.get(d, 0)
        total_seconds += secs
        total_entries += entry_counts.get(d, 0)
        ws.append([d.isoformat(), d.strftime("%A"), round(secs / 3600, 2), seconds_to_hhmm(secs), entry_counts.get(d, 0)])
        d += timedelta(days=1)

    ws.append([])
    ws.append(["Total", "", round(total_seconds / 3600, 2), seconds_to_hhmm(total_seconds), total_entries])
    for cell in ws[ws.max_row]:
        cell.font = header_font
    for col, width in zip("ABCDE", [12, 12, 12, 14, 10]):
        ws.column_dimensions[col].width = width

    ws2 = wb.create_sheet("Raw Entries")
    ws2.append(["ID", "Start", "End", "Duration (HH:MM)", "Note"])
    for cell in ws2[1]:
        cell.font = header_font
    for row in rows:
        s = parse_iso(row["start_ts"])
        e = effective_end(row)
        dur = (e - s).total_seconds()
        ws2.append([row["id"], row["start_ts"], row["end_ts"] or "(running)", seconds_to_hhmm(dur), row["note"] or ""])
    for col, width in zip("ABCDE", [6, 20, 20, 16, 30]):
        ws2.column_dimensions[col].width = width

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"timit-report-{start_date}-to-{end_date}.xlsx"
    return send_file(
        buf,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.get("/api/export/csv")
def export_csv():
    db = get_db()
    start_s, end_s = request.args.get("start"), request.args.get("end")
    if start_s or end_s:
        start_date, end_date = resolve_range(db, start_s, end_s)
        rows = get_entries_in_range(db, start_date, end_date)
    else:
        rows = db.execute("SELECT * FROM entries ORDER BY start_ts").fetchall()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "start_ts", "end_ts", "duration_seconds", "note"])
    for row in rows:
        dur = int((effective_end(row) - parse_iso(row["start_ts"])).total_seconds()) if row["end_ts"] else ""
        writer.writerow([row["id"], row["start_ts"], row["end_ts"] or "", dur, row["note"] or ""])
    mem = io.BytesIO(buf.getvalue().encode("utf-8"))
    return send_file(mem, as_attachment=True, download_name="timit-entries.csv", mimetype="text/csv")


@app.get("/api/export/json")
def export_json():
    db = get_db()
    start_s, end_s = request.args.get("start"), request.args.get("end")
    if start_s or end_s:
        start_date, end_date = resolve_range(db, start_s, end_s)
        rows = get_entries_in_range(db, start_date, end_date)
    else:
        rows = db.execute("SELECT * FROM entries ORDER BY start_ts").fetchall()
    data = [dict(r) for r in rows]
    mem = io.BytesIO(json.dumps(data, indent=2).encode("utf-8"))
    return send_file(mem, as_attachment=True, download_name="timit-entries.json", mimetype="application/json")


@app.get("/api/backup")
def backup():
    return send_file(
        DB_PATH,
        as_attachment=True,
        download_name=f"timit-backup-{datetime.now():%Y%m%d-%H%M%S}.db",
        mimetype="application/x-sqlite3",
    )


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5252))
    app.run(debug=True, port=port)
