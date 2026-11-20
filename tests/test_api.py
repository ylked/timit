"""API tests. Run with: TIMIT_DB is pointed at a temp file, so real data is never touched."""
import importlib
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
