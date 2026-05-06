"""Train XGBoost + Random Forest binary classifiers for will_fail_10min (D4, D9)."""
from __future__ import annotations

import json
import pathlib

import joblib
import mlflow
import mlflow.sklearn
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    average_precision_score,
    classification_report,
    f1_score,
    roc_auc_score,
)
from xgboost import XGBClassifier

from sentinel_pdm.config import settings
from sentinel_pdm.training.features import FEATURES, TARGET, prepare_training_frame

PARQUET_PATH = pathlib.Path("data/training_telemetry.parquet")
MODELS_DIR = pathlib.Path("models")
TRAIN_FRAC = 0.80  # time-based split — first 80% rows train, last 20% test


def _time_split(
    X: pd.DataFrame, y: pd.Series
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    n = len(X)
    cut = int(n * TRAIN_FRAC)
    return X.iloc[:cut], X.iloc[cut:], y.iloc[:cut], y.iloc[cut:]


def _log_metrics(y_test: pd.Series, y_prob: np.ndarray, y_pred: np.ndarray) -> dict:
    metrics = {
        "roc_auc": roc_auc_score(y_test, y_prob),
        "pr_auc": average_precision_score(y_test, y_prob),
        "f1": f1_score(y_test, y_pred),
    }
    mlflow.log_metrics(metrics)
    return metrics


def train() -> None:
    mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
    mlflow.set_experiment(settings.mlflow_experiment_name)

    print("Loading parquet …")
    df = pd.read_parquet(PARQUET_PATH)
    X, y = prepare_training_frame(df)
    X_train, X_test, y_train, y_test = _time_split(X, y)

    pos_weight = (y_train == 0).sum() / (y_train == 1).sum()
    print(f"Train rows: {len(X_train):,}  Test rows: {len(X_test):,}")
    print(f"Positive rate train: {y_train.mean():.4f}  test: {y_test.mean():.4f}")
    print(f"scale_pos_weight: {pos_weight:.1f}")

    MODELS_DIR.mkdir(exist_ok=True)
    results: dict[str, dict] = {}

    # ---- XGBoost ----
    xgb_params = {
        "n_estimators": 400,
        "max_depth": 6,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "scale_pos_weight": pos_weight,
        "eval_metric": "logloss",
        "random_state": 42,
        "n_jobs": -1,
    }
    with mlflow.start_run(run_name="xgboost"):
        mlflow.log_params(xgb_params)
        mlflow.log_param("model_type", "xgboost")
        mlflow.log_param("train_rows", len(X_train))
        mlflow.log_param("test_rows", len(X_test))
        xgb = XGBClassifier(**xgb_params)
        xgb.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
        xgb_prob = xgb.predict_proba(X_test)[:, 1]
        xgb_pred = (xgb_prob >= 0.5).astype(int)
        metrics = _log_metrics(y_test, xgb_prob, xgb_pred)
        results["xgboost"] = metrics
        print("\n[XGBoost]", metrics)
        print(classification_report(y_test, xgb_pred, digits=3))

    # ---- Random Forest ----
    rf_params = {
        "n_estimators": 300,
        "max_depth": 15,
        "min_samples_split": 3,
        "min_samples_leaf": 5,
        "class_weight": "balanced",
        "random_state": 42,
        "n_jobs": -1,
    }
    with mlflow.start_run(run_name="random_forest"):
        mlflow.log_params(rf_params)
        mlflow.log_param("model_type", "random_forest")
        mlflow.log_param("train_rows", len(X_train))
        mlflow.log_param("test_rows", len(X_test))
        rf = RandomForestClassifier(**rf_params)
        rf.fit(X_train, y_train)
        rf_prob = rf.predict_proba(X_test)[:, 1]
        rf_pred = (rf_prob >= 0.5).astype(int)
        metrics = _log_metrics(y_test, rf_prob, rf_pred)
        results["random_forest"] = metrics
        print("\n[Random Forest]", metrics)
        print(classification_report(y_test, rf_pred, digits=3))

    # ---- Ensemble (average of both probabilities) ----
    with mlflow.start_run(run_name="ensemble"):
        ens_prob = (xgb_prob + rf_prob) / 2
        ens_pred = (ens_prob >= 0.5).astype(int)
        metrics = _log_metrics(y_test, ens_prob, ens_pred)
        mlflow.log_param("model_type", "ensemble_avg")
        results["ensemble"] = metrics
        print("\n[Ensemble]", metrics)
        print(classification_report(y_test, ens_pred, digits=3))

    # ---- Save best model by ROC-AUC ----
    best_name = max(results, key=lambda k: results[k]["roc_auc"])
    best_model = {"xgboost": xgb, "random_forest": rf, "ensemble": (xgb, rf)}[best_name]
    out_path = MODELS_DIR / "classifier.joblib"
    joblib.dump({"model": best_model, "variant": best_name, "features": FEATURES}, out_path)
    print(f"\nBest variant: {best_name}  →  saved to {out_path}")

    summary_path = MODELS_DIR / "classifier_metrics.json"
    summary_path.write_text(json.dumps(results, indent=2))
    print(f"Metrics summary → {summary_path}")


if __name__ == "__main__":
    train()
