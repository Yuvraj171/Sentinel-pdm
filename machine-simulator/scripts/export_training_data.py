"""Export a fast-gen SimRun to Parquet for pdm-ai-engine training.

Usage:
    python scripts/export_training_data.py
    python scripts/export_training_data.py --sim-run-id 3
    python scripts/export_training_data.py --output ../pdm-ai-engine/data/foo.parquet

If --sim-run-id is omitted, the most recent COMPLETED SimRun is exported
(skipping the live SimRun id=1 which is GENERATING/RUNNING/etc.).

The Parquet is the canonical training input for pdm-ai-engine. Schema
matches the Telemetry model; downstream feature engineering happens in
pdm-ai-engine/src/sentinel_pdm/training/features.py (Day 7).

Run from the machine-simulator/ directory so backend.* imports resolve.
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Make backend.* importable when running this script from anywhere.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
from sqlalchemy import desc, select

from backend.database import AsyncSessionLocal
from backend.models import SimRun, Telemetry


DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent.parent / (
    "pdm-ai-engine/data/training_telemetry.parquet"
)


async def find_latest_completed_run() -> int:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SimRun)
            .where(SimRun.status == "COMPLETED")
            .order_by(desc(SimRun.id))
            .limit(1)
        )
        run = result.scalar_one_or_none()
        if run is None:
            raise SystemExit(
                "No COMPLETED SimRun found. Run fast-gen first via "
                "POST /simulation/generate-training-data."
            )
        return run.id


async def export(sim_run_id: int, output: Path) -> None:
    async with AsyncSessionLocal() as session:
        run_result = await session.execute(
            select(SimRun).where(SimRun.id == sim_run_id)
        )
        run = run_result.scalar_one_or_none()
        if run is None:
            raise SystemExit(f"SimRun id={sim_run_id} not found")

        result = await session.execute(
            select(Telemetry)
            .where(Telemetry.sim_run_id == sim_run_id)
            .order_by(Telemetry.timestamp_sim)
        )
        rows = result.scalars().all()

    if not rows:
        raise SystemExit(f"SimRun id={sim_run_id} has 0 rows")

    df = pd.DataFrame([
        {
            "timestamp_sim": r.timestamp_sim,
            "induction_power": r.induction_power,
            "coil_voltage": r.coil_voltage,
            "quench_water_temp": r.quench_water_temp,
            "quench_water_flow": r.quench_water_flow,
            "quench_pressure": r.quench_pressure,
            "coil_scan_speed": r.coil_scan_speed,
            "part_temp": r.part_temp,
            "vibration": r.vibration,
            "state": r.state,
            "failure_mode": r.failure_mode,
            "time_to_failure_s": r.time_to_failure_s,
            "will_fail_10min": r.will_fail_10min,
        }
        for r in rows
    ])

    output.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output, compression="snappy", index=False)

    size_mb = output.stat().st_size / (1024 * 1024)
    label_counts = df["will_fail_10min"].value_counts(dropna=False).to_dict()
    state_counts = df["state"].value_counts().to_dict()
    mode_counts = df["failure_mode"].value_counts().to_dict()

    print(f"Exported SimRun id={sim_run_id} -> {output}")
    print(f"  rows: {len(df):,}  size: {size_mb:.1f} MB")
    print(f"  state counts: {state_counts}")
    print(f"  failure_mode counts: {mode_counts}")
    print(f"  will_fail_10min counts: {label_counts}")


async def _main_async(sim_run_id: int | None, output: Path) -> None:
    if sim_run_id is None:
        sim_run_id = await find_latest_completed_run()
        print(
            f"auto-selected most recent COMPLETED SimRun: id={sim_run_id}",
            file=sys.stderr,
        )
    await export(sim_run_id, output)


def main() -> None:
    description = (__doc__ or "").split("\n\n")[0]
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "--sim-run-id", type=int, default=None,
        help="SimRun to export (default: most recent COMPLETED)",
    )
    parser.add_argument(
        "--output", type=Path, default=DEFAULT_OUTPUT,
        help=f"Output Parquet path (default: {DEFAULT_OUTPUT})",
    )
    args = parser.parse_args()
    asyncio.run(_main_async(args.sim_run_id, args.output))


if __name__ == "__main__":
    main()
