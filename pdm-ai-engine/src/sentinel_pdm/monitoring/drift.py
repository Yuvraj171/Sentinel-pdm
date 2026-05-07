"""PSI drift monitoring — compares live sensor distribution to training baseline."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from sentinel_pdm.config import settings
from sentinel_pdm.training.features import FEATURES

MODELS_DIR = Path(__file__).resolve().parents[3] / "models"
_EPSILON = 1e-4


def _load_reference() -> dict:
    path = MODELS_DIR / "reference_distribution.json"
    with open(path) as f:
        return json.load(f)


def compute_psi(
    reference: dict,
    live_df: pd.DataFrame,
    warn_threshold: float = settings.drift_psi_warning_threshold,
    crit_threshold: float = settings.drift_psi_critical_threshold,
) -> dict:
    scores: dict[str, float] = {}

    for feature in FEATURES:
        if feature not in reference or feature not in live_df.columns:
            continue

        mean = reference[feature]["mean"]
        std = reference[feature]["std"]

        edges = np.linspace(mean - 3 * std, mean + 3 * std, 11)

        ref_sample = np.random.default_rng(42).normal(mean, std, 10_000).clip(edges[0], edges[-1])
        ref_counts, _ = np.histogram(ref_sample, bins=edges)
        ref_pct = np.maximum(ref_counts / ref_counts.sum(), _EPSILON)

        live_vals = np.array(live_df[feature].dropna(), dtype=float).clip(edges[0], edges[-1])
        live_counts, _ = np.histogram(live_vals, bins=edges)
        live_pct = np.maximum(live_counts / live_counts.sum(), _EPSILON)

        psi = float(np.sum((live_pct - ref_pct) * np.log(live_pct / ref_pct)))
        scores[feature] = round(psi, 6)

    overall = max(scores.values()) if scores else 0.0

    if overall >= crit_threshold:
        status = "CRITICAL"
    elif overall >= warn_threshold:
        status = "WARNING"
    else:
        status = "OK"

    return {**scores, "overall": round(overall, 6), "status": status}
