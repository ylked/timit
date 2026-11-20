"""API tests. Run with: TIMIT_DB is pointed at a temp file, so real data is never touched."""
import importlib
import io
import os
from datetime import datetime, timedelta

import pytest


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TIMIT_DB", str(tmp_path / "test.db"))
    import app as app_module

    importlib.reload(app_module)  # re-reads TIMIT_DB and creates the schema
    return app_module.app.test_client()


def add(client, start, end, note=""):
    r = client.post("/api/entries", json={"start_ts": start, "end_ts": end, "note": note})
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def test_insights_empty(client):
    assert client.get("/api/insights").get_json() == {"empty": True}


def test_insights_aggregates(client):
    # Monday 2026-11-02, 09:30–12:00 and 13:00–14:00; Wednesday 2026-11-04 08:00–10:00
    add(client, "2026-11-02T09:30:00", "2026-11-02T12:00:00", "Planning")
    add(client, "2026-11-02T13:00:00", "2026-11-02T14:00:00")
    add(client, "2026-11-04T08:00:00", "2026-11-04T10:00:00", "Planning")
    data = client.get("/api/insights").get_json()

    assert data["empty"] is False
    assert data["total_seconds"] == 5.5 * 3600
    assert data["days_worked"] == 2
    assert data["sessions"]["count"] == 3
    assert data["sessions"]["longest"]["seconds"] == 2.5 * 3600
    # Heatmap splits by hour: Monday 09:30–10:00 is 30 minutes in the 9 o'clock slot.
    assert data["heatmap"][0][9] == 1800
    assert data["heatmap"][0][10] == 3600
    assert data["heatmap"][2][8] == 3600
    assert data["weekdays"][0]["days_worked"] == 1
    assert data["weekdays"][0]["avg_seconds"] == 3.5 * 3600
    assert data["earliest_start"] == {"date": "2026-11-04", "minutes": 8 * 60}
    assert data["latest_end"] == {"date": "2026-11-02", "minutes": 14 * 60}
    assert data["best_day"] == {"date": "2026-11-02", "seconds": 3.5 * 3600}
    # First week: 5.5h worked vs default 15h quota → balance −9.5h after it.
    first = data["weeks"][0]
    assert first["week_start"] == "2026-11-02"
    assert first["balance_after"] == (5.5 - 15) * 3600


def test_quota_streak_ignores_zero_weeks(client):
    client.put("/api/quota/settings", json={"weekly_hours": 2, "start_date": "2026-10-05"})
    add(client, "2026-10-05T09:00:00", "2026-10-05T12:00:00")  # week 1: met
    client.put("/api/quota/weeks/2026-10-12", json={"hours": 0, "note": "vacation"})  # week 2: off
    add(client, "2026-10-19T09:00:00", "2026-10-19T12:00:00")  # week 3: met
    streak = client.get("/api/insights").get_json()["quota_streak"]
    # Week 4 (26 Oct) and later are under quota, so the current streak is broken, but the best is 2.
    assert streak["best"] == 2


def test_backdated_start(client):
    start = (datetime.now() - timedelta(minutes=15)).replace(microsecond=0).isoformat()
    r = client.post("/api/timer/start", json={"note": "late", "start_ts": start})
    assert r.status_code == 200
    status = client.get("/api/timer/status").get_json()
    assert status["running"] and status["entry"]["start_ts"] == start
    assert "now" in status


def test_future_start_rejected(client):
    future = (datetime.now() + timedelta(hours=1)).isoformat()
    assert client.post("/api/timer/start", json={"start_ts": future}).status_code == 400


def test_recent_notes(client):
    add(client, "2026-11-02T09:00:00", "2026-11-02T10:00:00", "Old")
    add(client, "2026-11-03T09:00:00", "2026-11-03T10:00:00", "New")
    add(client, "2026-11-04T09:00:00", "2026-11-04T10:00:00", "")
    notes = [n["note"] for n in client.get("/api/notes").get_json()]
    assert notes == ["New", "Old"]


def test_unknown_api_path_is_json_404(client):
    r = client.get("/api/does-not-exist")
    assert r.status_code == 404
    assert r.is_json


def make_hr_template():
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws["A1"] = "Hourly rate: CHF 26.00/hour, working hours must be sent by email"  # long text: not the header
    ws["A3"], ws["B3"], ws["C3"] = "Date", "Timesheet submission deadline", "Working Hours"
    ws["A4"], ws["B4"] = "02.11.26 to 08.11.26", "09.11.26 at 12.00 PM"
    ws["A5"], ws["B5"] = "09.11.26 to 15.11.26", "16.11.26 at 12.00 PM"
    ws["A6"], ws["B6"] = "28.12.26 to 03.01.26", "04.01.27 at 12.00 PM"  # year typo as in the real file
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def test_hr_template_export(client):
    from openpyxl import load_workbook

    add(client, "2026-11-02T09:00:00", "2026-11-02T10:30:00")
    add(client, "2026-11-10T09:00:00", "2026-11-10T09:20:00")
    r = client.post("/api/hr-template", data={"file": (make_hr_template(), "hours_26.xlsx")}, content_type="multipart/form-data")
    assert r.status_code == 200, r.get_json()
    info = r.get_json()
    assert [p["start"] for p in info["periods"]] == ["2026-11-02", "2026-11-09", "2026-12-28"]
    assert info["periods"][2]["end"] == "2027-01-03"

    r = client.get("/api/export/hr?upto=2026-11-09")
    assert "hours_26.xlsx" in r.headers["Content-Disposition"]
    ws = load_workbook(io.BytesIO(r.data)).active
    assert ws["C4"].value == 1.5
    assert ws["C5"].value == 0.33
    assert ws["C6"].value is None  # starts after `upto`: left blank
    assert ws["A1"].value.startswith("Hourly rate")


def test_hr_template_rejects_files_without_periods(client):
    from openpyxl import Workbook

    buf = io.BytesIO()
    Workbook().save(buf)
    buf.seek(0)
    r = client.post("/api/hr-template", data={"file": (buf, "empty.xlsx")}, content_type="multipart/form-data")
    assert r.status_code == 400
    assert client.get("/api/export/hr").status_code == 404


def test_rates_and_earnings(client):
    # 2h on 31 Aug (before any rate), 2h on 1 Sep at 26, 1h on 1 Oct at 30.
    add(client, "2026-08-31T09:00:00", "2026-08-31T11:00:00")
    add(client, "2026-09-01T09:00:00", "2026-09-01T11:00:00")
    add(client, "2026-10-01T09:00:00", "2026-10-01T10:00:00")
    assert client.get("/api/insights").get_json()["earned_total"] is None  # no rate yet

    r = client.put("/api/rates", json={"currency": "chf", "rates": [
        {"start_date": "2026-10-01", "rate": 30}, {"start_date": "2026-09-01", "rate": 26},
    ]})
    assert r.status_code == 200
    assert r.get_json() == {"currency": "CHF", "rates": [{"start_date": "2026-09-01", "rate": 26}, {"start_date": "2026-10-01", "rate": 30}]}

    ins = client.get("/api/insights").get_json()
    assert ins["earned_total"] == 2 * 26 + 30
    assert ins["rate"] == 30
    by_month = {m["month"]: m["earned"] for m in ins["months"]}
    assert (by_month["2026-08"], by_month["2026-09"], by_month["2026-10"]) == (0, 52, 30)

    days = client.get("/api/summary/day?start=2026-09-01&end=2026-09-01").get_json()
    assert days[0]["earned"] == 52

    client.post("/api/periods", json={"start_date": "2026-09-01", "end_date": "2026-10-01"})
    periods = client.get("/api/periods").get_json()
    assert periods["periods"][0]["earned"] == 82
    assert periods["unsubmitted"]["earned"] == 0  # 31 Aug is unsubmitted but had no rate


def test_rates_validation(client):
    assert client.put("/api/rates", json={"currency": "francs", "rates": []}).status_code == 400
    assert client.put("/api/rates", json={"rates": [{"start_date": "2026-09-01", "rate": -1}]}).status_code == 400
    dup = [{"start_date": "2026-09-01", "rate": 1}, {"start_date": "2026-09-01", "rate": 2}]
    assert client.put("/api/rates", json={"rates": dup}).status_code == 400
