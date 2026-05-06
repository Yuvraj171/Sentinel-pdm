"""Train Isolation Forest anomaly detector on normal-only rows (D4, D9)."""
from __future__ import annotations

import json
import pathlib

import joblib
import mlflow
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import roc_auc_score

from sentinel_pdm.config import settings
from sentinel_pdm.training.features import FEATURES, prepare_training_frame

PARQUET_PATH = pathlib.Path("data/training_telemetry.parquet")
MODELS_DIR = pathlib.Path("models")


def train() -> None:
    mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
    mlflow.set_experiment(settings.mlflow_experiment_name)

    print("Loading parquet …")
    df = pd.read_parquet(PARQUET_PATH)
    X, y = prepare_training_frame(df)

    # Train only on normal rows — IF learns what "normal" looks like
    normal_mask = y == 0
    X_normal = X[normal_mask]
    print(f"Normal rows for IF training: {len(X_normal):,}")
    print(f"All rows for evaluation: {len(X):,}")

    if_params = {
        "n_estimators": 200,
        "contamination": 0.05,
        "max_samples": "auto",
        "random_state": 42,
        "n_jobs": -1,
    }

    with mlflow.start_run(run_name="isolation_forest"):
        mlflow.log_params(if_params)
        mlflow.log_param("train_rows_normal_only", len(X_normal))
        mlflow.log_param("eval_rows_all", len(X))

        iso = IsolationForest(**if_params)
        iso.fit(X_normal)

        # score_samples returns negative scores: more negative = more anomalous
        # Flip sign so higher = more anomalous (easier to reason about)
        scores = -iso.score_samples(X)
        roc = roc_auc_score(y, scores)
        mlflow.log_metric("roc_auc_anomaly", roc)
        print(f"\n[Isolation Forest] ROC-AUC (anomaly scores vs labels): {roc:.4f}")

        # Reference distribution: feature means + stds on normal training rows
        ref = {
            col: {
                "mean": float(X_normal[col].mean()),
                "std": float(X_normal[col].std(ddof=1)),
            }
            for col in FEATURES
        }
        ref_path = MODELS_DIR / "reference_distribution.json"
        ref_path.write_text(json.dumps(ref, indent=2))
        mlflow.log_artifact(str(ref_path))
        print(f"Reference distribution → {ref_path}")

    out_path = MODELS_DIR / "anomaly.joblib"
    joblib.dump({"model": iso, "features": FEATURES}, out_path)
    print(f"Isolation Forest → {out_path}")


if __name__ == "__main__":
    train()
