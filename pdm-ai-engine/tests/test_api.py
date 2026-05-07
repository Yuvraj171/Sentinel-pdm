"""Tests for FastAPI endpoints — uses TestClient and mocked DB."""
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from sentinel_pdm.services import api


@pytest.fixture
def client():
    return TestClient(api.app)


VALID_PAYLOAD = {
    "induction_power": 100.0,
    "coil_voltage": 380.0,
    "quench_water_temp": 25.0,
    "quench_water_flow": 40.0,
    "quench_pressure": 5.0,
    "coil_scan_speed": 10.0,
    "part_temp": 900.0,
    "vibration": 2.5,
}


# === TEST 1: /health ===
def test_health_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# === TEST 2: /predict with valid payload ===
def test_predict_valid(client, monkeypatch):
    fake_predictor = MagicMock()
    fake_predictor.predict.return_value = {
        "ai_risk_score": 0.42,
        "ai_anomaly_score": -0.1,
        "ai_status": "WARNING",
    }
    monkeypatch.setattr(api, "predictor", fake_predictor)

    response = client.post("/predict", json=VALID_PAYLOAD)

    assert response.status_code == 200
    body = response.json()
    assert body["ai_risk_score"] == 0.42
    assert body["ai_status"] == "WARNING"


# === TEST 3: /predict rejects invalid payload ===
def test_predict_invalid_payload(client):
    incomplete = {"induction_power": 100.0}  # missing 7 required fields
    response = client.post("/predict", json=incomplete)
    assert response.status_code == 422


# === TEST 4: /predict 503 when models not loaded ===
def test_predict_no_models(client, monkeypatch):
    monkeypatch.setattr(api, "predictor", None)
    response = client.post("/predict", json=VALID_PAYLOAD)
    assert response.status_code == 503


def make_mock_session(rows):
    """Build a fake async_session() that yields a session whose
    execute().mappings() returns the given list of row dicts."""
    mock_mappings = MagicMock()
    mock_mappings.fetchone.return_value = rows[0] if rows else None
    mock_mappings.all.return_value = rows

    mock_result = MagicMock()
    mock_result.mappings.return_value = mock_mappings

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_ctx = MagicMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=None)

    return MagicMock(return_value=mock_ctx)


# === TEST 5: /status returns latest row ===
def test_status_returns_row(client, monkeypatch):
    fake_row = {
        "id": 123,
        "timestamp_sim": "2026-05-08T12:00:00",
        "ai_risk_score": 0.55,
        "ai_anomaly_score": -0.2,
        "ai_status": "WARNING",
    }
    monkeypatch.setattr(api, "async_session", make_mock_session([fake_row]))

    response = client.get("/status")

    assert response.status_code == 200
    assert response.json()["ai_risk_score"] == 0.55


# === TEST 6: /status 503 when no predictions exist ===
def test_status_no_predictions(client, monkeypatch):
    monkeypatch.setattr(api, "async_session", make_mock_session([]))
    response = client.get("/status")
    assert response.status_code == 503


# === TEST 7: /api/recent-predictions returns reversed list ===
def test_recent_predictions_returns_list(client, monkeypatch):
    fake_rows = [
        {"id": 3, "timestamp_sim": "2026-05-08T12:02:00", "ai_risk_score": 0.3,
         "ai_anomaly_score": -0.1, "ai_status": "OK",
         "induction_power": 100.0, "quench_water_flow": 40.0,
         "quench_pressure": 5.0, "part_temp": 900.0},
        {"id": 2, "timestamp_sim": "2026-05-08T12:01:00", "ai_risk_score": 0.2,
         "ai_anomaly_score": -0.15, "ai_status": "OK",
         "induction_power": 99.0, "quench_water_flow": 41.0,
         "quench_pressure": 5.1, "part_temp": 895.0},
    ]
    monkeypatch.setattr(api, "async_session", make_mock_session(fake_rows))

    response = client.get("/api/recent-predictions?limit=10")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    # endpoint reverses the DESC query, so oldest comes first
    assert body[0]["id"] == 2
    assert body[1]["id"] == 3


# === TEST 8: /api/drift 503 when no scored rows ===
def test_drift_no_rows(client, monkeypatch):
    monkeypatch.setattr(api, "async_session", make_mock_session([]))
    response = client.get("/api/drift")
    assert response.status_code == 503


# === TEST 9: /api/drift returns PSI dict ===
def test_drift_returns_dict(client, monkeypatch):
    from datetime import datetime, timedelta

    base = datetime(2026, 5, 8, 12, 0, 0)
    fake_rows = [
        {
            "timestamp_sim": base + timedelta(seconds=i),
            "induction_power": 100.0,
            "coil_voltage": 380.0,
            "quench_water_temp": 25.0,
            "quench_water_flow": 40.0,
            "quench_pressure": 5.0,
            "coil_scan_speed": 10.0,
            "part_temp": 900.0,
            "vibration": 2.5,
        }
        for i in range(120)
    ]
    monkeypatch.setattr(api, "async_session", make_mock_session(fake_rows))

    response = client.get("/api/drift")

    assert response.status_code == 200
    body = response.json()
    assert "overall" in body
    assert "status" in body
    assert body["status"] in ("OK", "WARNING", "CRITICAL")
