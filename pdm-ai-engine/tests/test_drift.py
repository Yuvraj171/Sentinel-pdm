"""Tests for PSI drift monitoring."""
import numpy as np
import pandas as pd
import pytest

from sentinel_pdm.monitoring.drift import compute_psi, _load_reference
from sentinel_pdm.training.features import FEATURES


def _make_reference(seed: int = 0) -> dict:
    rng = np.random.default_rng(seed)
    return {
        f: {"mean": float(rng.uniform(10, 100)),
            "std": float(rng.uniform(1, 10))}
        for f in FEATURES
    }


def _make_live_df(reference: dict, rng: np.random.Generator, shift_fn) -> pd.DataFrame:
    """Build a 500-row DataFrame. shift_fn(mean, std) returns the sample mean to use."""
    data = {
        f: rng.normal(shift_fn(reference[f]["mean"], reference[f]["std"]),
                      reference[f]["std"], 500)
        for f in FEATURES
    }
    return pd.DataFrame(data)


# --- Test 1 ---
def test_psi_zero_for_identical():
    reference = _make_reference(0)
    rng = np.random.default_rng(1)
    # shift_fn returns the same mean → live looks like reference
    live_df = _make_live_df(reference, rng, lambda mean, std: mean)
    result = compute_psi(reference, live_df,
                         warn_threshold=0.1, crit_threshold=0.2)
    assert result["status"] == "OK"
    assert result["overall"] < 0.1


# --- Test 2 ---
def test_psi_critical_all_features_shifted():
    reference = _make_reference(0)
    rng = np.random.default_rng(2)
    # shift_fn shifts mean by +5*std for every feature
    live_df = _make_live_df(reference, rng, lambda mean, std: mean + 5 * std)
    result = compute_psi(reference, live_df,
                         warn_threshold=0.1, crit_threshold=0.2)
    assert result["status"] == "CRITICAL"
    assert result["overall"] > 0.2


# --- Test 3 ---
def test_psi_critical_single_feature_shifted():
    reference = _make_reference(0)
    rng = np.random.default_rng(3)

    # Build live_df where only quench_water_flow is shifted by +5*std,
    # everything else matches reference
    data = {
        f: rng.normal(
            reference[f]["mean"] + (5 * reference[f]["std"]
                                    if f == "quench_water_flow" else 0),
            reference[f]["std"], 500
        )
        for f in FEATURES
    }
    live_df = pd.DataFrame(data)

    result = compute_psi(reference, live_df,
                         warn_threshold=0.1, crit_threshold=0.2)
    assert result["status"] == "CRITICAL"
    assert result["overall"] > 0.2


# --- Test 4 ---
def test_psi_missing_columns_graceful():
    reference = _make_reference(0)
    rng = np.random.default_rng(4)

    # DataFrame with only 3 features — the rest are missing
    partial_df = pd.DataFrame({
        "induction_power": rng.normal(reference["induction_power"]["mean"],
                                      reference["induction_power"]["std"], 100),
        "quench_water_flow": rng.normal(reference["quench_water_flow"]["mean"],
                                        reference["quench_water_flow"]["std"], 100),
        "part_temp": rng.normal(reference["part_temp"]["mean"],
                                reference["part_temp"]["std"], 100),
    })

    result = compute_psi(reference, partial_df,
                         warn_threshold=0.1, crit_threshold=0.2)
    assert "overall" in result
    assert "status" in result


# --- Test 5 ---
def test_psi_loads_real_reference():
    reference = _load_reference()

    # Confirm the JSON loaded correctly — spot check a few known keys
    assert "induction_power" in reference
    assert "mean" in reference["induction_power"] and "std" in reference["induction_power"]

    # Build a live_df from the real reference and confirm compute_psi runs without error
    rng = np.random.default_rng(5)
    live_df = pd.DataFrame({
        f: rng.normal(reference[f]["mean"], reference[f]["std"], 200)
        # use real reference keys, not FEATURES — test the actual file
        for f in reference
    })
    result = compute_psi(reference, live_df,
                         warn_threshold=0.1, crit_threshold=0.2)
    assert "overall" in result
    assert "status" in result
