# Master Design Document

## Table of Contents

- [Introduction](#introduction)
- [System Architecture](#system-architecture)
- [Components](#components)
- [Design Decisions](#design-decisions)
- [Testing](#testing)
- [Future Work](#future-work)

## Introduction

[cite_start]This document outlines the design of the **Induction Hardening Machine Simulator**, a software tool created to serve as a high-fidelity "Data Factory"[cite: 8]. [cite_start]Its primary purpose is to generate continuous, physics-based telemetry streams—replicating real-world heating cycles, sensor noise, and complex component degradation—to facilitate the training and validation of AI models for Predictive Maintenance and Process Quality Assurance[cite: 9, 12, 13].

## System Architecture

[cite_start]The Machine Simulator is built using a modular, **Event-Driven Asynchronous Architecture**[cite: 64]. It decouples the simulation physics from the user interface to ensure high-performance data generation without freezing the dashboard.

The system comprises three core layers:

1.  **The Brain (Backend):** Python/FastAPI engine handling physics, state logic, and failure injection.
2.  **The Memory (Database):** PostgreSQL storage for time-series telemetry and state persistence.
3.  **The Face (Frontend):** React-based dashboard for real-time visualization and control.

**Technical Stack:**
* [cite_start]**Backend:** Python 3.11+, FastAPI (Async), SQLAlchemy (Async)[cite: 76].
* [cite_start]**Database:** PostgreSQL 15+ (Optimized for time-series)[cite: 79].
* **Frontend:** React (Vite).
* **Deployment:** Monorepo structure (`/backend`, `/frontend`).

## Components

### Machine Model

[cite_start]The Machine Model component represents the physical and mathematical "Digital Twin" of the Induction Hardening machine[cite: 8]. It includes the following subcomponents:

#### Machine Components
* [cite_start]**Induction Coil:** The primary heating element subject to wear (tracked via `coil_life_counter`)[cite: 41].
* [cite_start]**Quench System:** Handles coolant flow, temperature, and pressure management[cite: 37].
* [cite_start]**PLC State Controller:** Manages the operational logic flow[cite: 19].

#### Machine Parameters
[cite_start]The model tracks the following critical physics-based signals[cite: 80]:
* `induction_power` (kW)
* `quench_water_temp` (°C)
* `quench_water_flow` (LPM)
* `quench_pressure` (Bar)
* `coil_scan_speed` (mm/s)
* `tempering_speed` (mm/s)

#### Machine Dynamics
[cite_start]The machine operates on a deterministic State Machine logic[cite: 19]:
1.  **IDLE:** Waiting state; power off.
2.  **LOADING:** Mechanical intake (3s fixed).
3.  **HEATING:** Power ON; Temperature ramps up.
4.  **QUENCH:** Cooling ON; Temperature decays.
5.  **UNLOADING:** Mechanical output (3s fixed).
6.  **DOWN:** Breakdown state; machine halted.

### Simulation Engine

[cite_start]The Simulation Engine component is responsible for simulating the behavior of the machine model and managing large-scale data generation[cite: 23]. It includes the following subcomponents:

#### Simulation Parameters
* **Anomaly Rate:** **10% Probability per Cycle** (Event-based). [cite_start]This ensures a dense dataset of ~250 failure events per 50k run[cite: 28].
* [cite_start]**Data Volume:** Strict limit of **50,000 rows** per generated batch[cite: 28].
* [cite_start]**Time Compression:** 1 hour of `DOWN` time is compressed into a single data row to optimize storage[cite: 28].

#### Simulation Algorithms
1.  **Thermal Coupling (Physics):**
    [cite_start]Uses a discretized Newton’s Law of Cooling to ensure `quench_water_temp` correlates realistically with `induction_power`[cite: 67, 68].
    $$T_{new} = T_{prev} + (C_{heat} \cdot P_{in}) - (C_{cool} \cdot F_{flow}) - C_{loss} \cdot (T_{prev} - T_{amb}) + \text{Noise}$$

2.  **Failure Priority Logic:**
    [cite_start]Enforces a hierarchy where Safety Critical faults stop the machine immediately, while Quality faults buffer 5 NG parts first[cite: 46, 49].
    * **Priority 1 (Safety):** Immediate Stop (e.g., Hose Burst, Coil Fail).
    * **Priority 2 (Ops):** Immediate Stop (e.g., Pressure Drop).
    * **Priority 3 (Quality):** Produce 5 NG parts $\rightarrow$ Stop (e.g., Overheating).

3.  **Auto-Recovery Algorithm:**
    [cite_start]Automatically manages the transition: `DOWN` $\rightarrow$ `WARM` (10 min ramp) $\rightarrow$ `START`[cite: 28].

#### Simulation Results
* [cite_start]**Live Stream:** 1 Hz telemetry available via REST API[cite: 21, 59].
* [cite_start]**CSV Export:** `SimRun_[ID]_[Date].csv` generated in <10 seconds[cite: 64, 77].
* [cite_start]**Persistence:** Counters (Coil Life, OK/NG) survive restarts[cite: 70].

### User Interface

[cite_start]The User Interface component provides a graphical interface for interacting with the simulation[cite: 14]. It includes the following subcomponents:

#### User Interface Components
* [cite_start]**Control Panel:** Buttons for "Start 50k Run," "Inject Fault," and "Master Reset"[cite: 20, 85].
* [cite_start]**Live Dashboard:** Real-time gauges for Temp, Power, and Flow[cite: 28].
* **Status Banner:** Visual indicator of current state (RUN / DOWN / IDLE).

#### User Interface Algorithms
* **Polling Sync:** UI polls the backend at 1 Hz to update gauges.
* [cite_start]**Jump Sync:** Upon completion of a 50k fast-forward, the dashboard instantly refreshes to display the final timestamp[cite: 28].

#### User Interface Results
* Visual confirmation of anomaly injection (Red indicators).
* Downloadable dataset links.

## Design Decisions

The following design decisions were made:

### Design Decision 1: Event-Based Anomaly Rate
[cite_start]**Decision:** The "10% Anomaly Rate" [cite: 28] is interpreted as a 10% probability *per production cycle*.
**Rationale:** This prevents "storming" the dataset with too many failures while ensuring enough anomaly data for AI training.

### Design Decision 2: Strict Row Limit vs. Compression
**Decision:** The generator stops exactly at 50,000 rows. [cite_start]Breakdowns use "Time Compression" (1 hour = 1 row) but do not extend the file length beyond 50k[cite: 28].
**Rationale:** Balances the need for efficient storage (FR-06) with the requirement for a predictable file size (FR-01).

### Design Decision 3: Internal Calendar Management
[cite_start]**Decision:** The simulator manages an internal clock starting at Day 1, 08:00 AM[cite: 85].
[cite_start]**Rationale:** It automatically toggles `shift_id` (Shift A/B) every 12 simulated hours to meet shift handover requirements[cite: 28].

## Testing

The following testing procedures were implemented:

### Testing Procedure 1: Reset Validation
**Action:** Click "Master Reset."
[cite_start]**Success Criteria:** Database is cleared, counters (OK/NG) return to 0, and the clock resets to Day 1, 08:00 AM[cite: 85].

### Testing Procedure 2: Compression & Continuity
**Action:** Trigger a long breakdown (e.g., 60 mins).
[cite_start]**Success Criteria:** The export shows a single row for the breakdown event, and the next timestamp is incremented by exactly 60 minutes + repair time[cite: 86, 88].

### Testing Procedure 3: Performance Benchmarking
**Action:** Trigger "Generate 50k Rows."
[cite_start]**Success Criteria:** The system completes generation and CSV export in under 10 seconds while the dashboard remains responsive[cite: 64].

## Future Work

The following future work was identified:

### Future Work 1: Real PLC Integration
Direct integration with OPC-UA / Modbus protocols to drive physical hardware instead of a simulated physics model.

### Future Work 2: Advanced Thermodynamics
Implementing finite element analysis (FEA) for more granular thermal gradients within the part geometry during the quench phase.

### Future Work 3: Multi-Machine Orchestration
Scaling the simulator to run multiple independent machine instances simultaneously to simulate a full production line.