"""Model loader and inference — called by both poll.py and api.py."""
from __future__ import annotations

import pathlib

import joblib  # type: ignore
import pandas as pd

from sentinel_pdm.training.features import FEATURES, compute_features

# Anchored to this file's location: services/ -> sentinel_pdm/ -> src/ -> pdm-ai-engine/models/
MODELS_DIR = pathlib.Path(__file__).resolve().parents[3] / "models"


class Predictor:
    def __init__(self) -> None:
        clf_bundle = joblib.load(MODELS_DIR / "classifier.joblib")
        ano_bundle = joblib.load(MODELS_DIR / "anomaly.joblib")

        self._variant = clf_bundle["variant"]
        self._clf = clf_bundle["model"]
        self._iso = ano_bundle["model"]
        print(f"Predictor ready — classifier variant: {self._variant}")

    def predict(self, rows: pd.DataFrame) -> dict:
        df = compute_features(rows)
        X = df[FEATURES].iloc[[-1]]

        if self._variant == "ensemble":
            xgb, rf = self._clf
            risk = float(
                (xgb.predict_proba(X)[0, 1] + rf.predict_proba(X)[0, 1]) / 2)
        else:
            risk = float(self._clf.predict_proba(X)[0, 1])

        anomaly = float(-self._iso.score_samples(X)[0])

        if risk >= 0.7:
            status = "CRITICAL"
        elif risk >= 0.3:
            status = "WARNING"
        else:
            status = "OK"

        return {"ai_risk_score": risk, "ai_anomaly_score": anomaly, "ai_status": status}
