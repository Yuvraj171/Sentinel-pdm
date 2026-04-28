from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from backend.database import get_db
from backend.models import Telemetry, SimRun
from datetime import datetime, timedelta
from typing import Optional
import csv
import io

router = APIRouter(
    prefix="/export",
    tags=["export"]
)

@router.get("/{run_id}")
async def export_run(run_id: int, db: AsyncSession = Depends(get_db)):
    """
    Streams the telemetry data for a specific run as a CSV file.
    """
    # 1. Verify Run Exists
    result = await db.execute(select(SimRun).where(SimRun.id == run_id))
    sim_run = result.scalars().first()
    if not sim_run:
        raise HTTPException(status_code=404, detail="Simulation Run not found")

    # 2. Generator Function for Streaming
    async def iter_csv():
        # CSV Header
        yield "Timestamp,State,Power(kW),Temp(C),Flow(LPM),Pressure(Bar),Anomaly\n"
        
        # Query Data (Streamed for memory efficiency)
        query = select(Telemetry).where(Telemetry.sim_run_id == run_id).order_by(Telemetry.timestamp_sim)
        result = await db.stream(query)
        
        async for row in result:
            t = row.Telemetry
            # Format row
            line = f"{t.timestamp_sim},{t.state},{t.induction_power},{t.part_temp},{t.quench_water_flow},{t.quench_pressure},{t.is_anomaly}\n"
            yield line

    # 3. Return Response
    filename = f"SimRun_{run_id}.csv"
    return StreamingResponse(
        iter_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/excel/{run_id}")
async def export_excel_run(
    run_id: int,
    last_n: Optional[int] = Query(None, description="Export last N parts only"),
    hours: Optional[float] = Query(None, description="Export data from last X hours"),
    session_only: bool = Query(False, description="Export only current session data"),
    since_export: bool = Query(False, description="Export only data since last export"),
    db: AsyncSession = Depends(get_db)
):
    """
    Generates an Excel file for the simulation run with optional filters.
    
    Filter Options:
    - last_n: Export only the last N parts (e.g., ?last_n=50)
    - hours: Export data from the last X hours (e.g., ?hours=2)
    - session_only: Export only data from current session since Reset (e.g., ?session_only=true)
    - since_export: Export only new data since last export (e.g., ?since_export=true)
    """
    try:
        import pandas as pd
    except ImportError:
        raise HTTPException(status_code=500, detail="pandas not installed. Run: pip install pandas openpyxl")
    
    try:
        # 1. Get SimRun for session/export tracking
        run_result = await db.execute(select(SimRun).where(SimRun.id == run_id))
        sim_run = run_result.scalars().first()
        
        # 2. Build Query with Filters
        query = select(Telemetry).where(Telemetry.sim_run_id == run_id)
        
        # Apply filters
        filter_desc = "All Data"
        
        if since_export and sim_run and sim_run.last_export_time:
            query = query.where(Telemetry.timestamp_sim > sim_run.last_export_time)
            filter_desc = f"Since Last Export ({sim_run.last_export_time})"
            
        elif session_only and sim_run and sim_run.session_start_time:
            query = query.where(Telemetry.timestamp_sim >= sim_run.session_start_time)
            filter_desc = f"Current Session (since {sim_run.session_start_time})"
            
        elif hours:
            cutoff_time = datetime.now() - timedelta(hours=hours) # Use Local Time
            query = query.where(Telemetry.timestamp_sim >= cutoff_time)
            filter_desc = f"Last {hours} hour(s)"
            
        elif last_n:
            # For last_n, we need to get the most recent N rows
            query = query.order_by(desc(Telemetry.id)).limit(last_n)
            filter_desc = f"Last {last_n} parts"
        
        # Order by timestamp (except for last_n which is already ordered)
        if not last_n:
            query = query.order_by(Telemetry.timestamp_sim)
        
        # 3. Execute Query
        result = await db.execute(query)
        rows = result.scalars().all()
        
        # For last_n, reverse to get chronological order
        if last_n:
            rows = list(reversed(rows))
        
        print(f"📊 EXPORT: Found {len(rows)} rows for run_id={run_id} (Filter: {filter_desc})")
        
        # 2. Convert to DataFrame
        data = []
        for t in rows:
            data.append({
                "Timestamp": t.timestamp_sim,
                "Shift": t.shift_id,
                "Operator": t.operator_id,
                "Part ID": t.part_id,
                "Machine State": t.state,
                
                # Process Params
                "Power (kW)": t.induction_power,
                "Part Temp (C)": t.part_temp, # Uses the new DB column
                "Quench Water Temp (C)": t.quench_water_temp,
                "Flow (LPM)": t.quench_water_flow,
                "Pressure (Bar)": t.quench_pressure,
                "Scan Speed (mm/s)": t.coil_scan_speed,
                "Temper Speed (mm/s)": t.tempering_speed,
                
                # Health & Maint
                "Coil Life": t.coil_life_counter,
                "Downtime Reason": t.downtime_reason,
                "NG Reason": t.ng_reason,  # NEW: Physical defect reason (CRACKING, SOFTNESS, etc.)
                "Repair Time (min)": t.repair_time,
                
                # Counters
                "OK Count": t.ok_count,
                "NG Count": t.ng_count,
                "Is Anomaly": "YES" if t.is_anomaly else "NO"
            })
    
        df = pd.DataFrame(data)
        
        # 3. Write to Buffer
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name=f"Run_{run_id}")
        
        output.seek(0)
        
        filename = f"SimRun_{run_id}.xlsx"
        
        # Update last_export_time for "Since Last Export" filter
        if sim_run:
            sim_run.last_export_time = datetime.utcnow()
            await db.commit()
            print(f"📅 Updated last_export_time for run_id={run_id}")
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ EXPORT ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
