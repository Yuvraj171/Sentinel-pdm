"""Feature engineering — shared between training and inference (D8)."""
from __future__ import annotations

import pandas as pd

# ---- Raw sensor columns (read from telemetry table, written by simulator) ----
RAW_SENSORS: list[str] = [
    "induction_power",
    "coil_voltage",
    "quench_water_temp",
    "quench_water_flow",
    "quench_pressure",
    "coil_scan_speed",
    "part_temp",
    "vibration",
]

# ---- Engineered + raw features the model actually sees ----
FEATURES: list[str] = [
    # Raw sensors pass through (8)
    *RAW_SENSORS,

    # Rolling 60s means (4) — level shifts on the 4 sensors most diagnostic of degradation
    "induction_power_mean_60",
    "quench_water_flow_mean_60",
    "quench_pressure_mean_60",
    "coil_voltage_mean_60",

    # Rolling 60s stds (3) — variance increase, the marker for power-supply drift specifically
    "induction_power_std_60",
    "quench_water_flow_std_60",
    "quench_pressure_std_60",

    # Rate of change over 10s (3) — trajectory, distinguishes "low" from "dropping"
    "quench_water_flow_roc",
    "quench_pressure_roc",
    "coil_voltage_roc",

    # Cross-feature (1) — Ohm's law impedance proxy
    "power_per_voltage",
]

TARGET: str = "will_fail_10min"

# ---- Rolling-window sizes (1Hz sampling, so seconds == sample count) ----
ROLLING_WINDOW: int = 60   # 60s mean/std window
ROC_LAG: int = 10          # 10s lag for rate-of-change differencing


def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    missing = [c for c in RAW_SENSORS if c not in df.columns]
    if missing:
        raise ValueError(
            f"compute_features: missing required sensor columns: {missing}")
    df = df.sort_values("timestamp_sim").reset_index(drop=True)
    roll = df.rolling(ROLLING_WINDOW, min_periods=1)
    df["induction_power_mean_60"] = roll["induction_power"].mean()
    df["quench_water_flow_mean_60"] = roll["quench_water_flow"].mean()
    df["quench_pressure_mean_60"] = roll["quench_pressure"].mean()
    df["coil_voltage_mean_60"] = roll["coil_voltage"].mean()

    df["induction_power_std_60"] = df["induction_power"].rolling(
        ROLLING_WINDOW, min_periods=2).std(ddof=1)
    df["quench_water_flow_std_60"] = df["quench_water_flow"].rolling(
        ROLLING_WINDOW, min_periods=2).std(ddof=1)
    df["quench_pressure_std_60"] = df["quench_pressure"].rolling(
        ROLLING_WINDOW, min_periods=2).std(ddof=1)

    df["quench_water_flow_roc"] = df["quench_water_flow"].diff(
        ROC_LAG) / ROC_LAG
    df["quench_pressure_roc"] = df["quench_pressure"].diff(ROC_LAG) / ROC_LAG
    df["coil_voltage_roc"] = df["coil_voltage"].diff(ROC_LAG) / ROC_LAG

    df["power_per_voltage"] = df["induction_power"] / \
        df["coil_voltage"].clip(lower=1.0)

    return df


def prepare_training_frame(
    df: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.Series]:
    df = compute_features(df)
    df = df[df[TARGET].notna()].copy()
    df = df[df[FEATURES].notna().all(axis=1)].copy()
    X = df[FEATURES].reset_index(drop=True)
    y = df[TARGET].astype(int).reset_index(drop=True)
    return X, y
