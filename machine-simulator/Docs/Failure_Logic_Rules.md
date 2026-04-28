# Simulation Logic Reference

This document serves as the "Source of Truth" for the Machine Simulator's physics, quality, and failure logic.

## 1. Process Cycle Logic

The machine follows a strictly **Event-Driven** cycle based on physics triggers, not just timers.

| Phase | Trigger | Action |
| :--- | :--- | :--- |
| **LOADING** | Instant | Reset Peak Values. Load Sensor Noise. |
| **HEATING** | Start (Instant) | **Power: 50 kW**. Flow: 0. Scan Speed: 10 mm/s. |
| **QUENCH** | **Temp >= 850°C** | Power: 0. **Flow: 120 LPM** (Instant). Scan Speed: 8 mm/s. |
| **UNLOADING** | **Temp <= 50°C** | Log Data. Increment Counters. Check Quality. |

> **Note**: Quench Flow is **Instant ON**. There is no ramp-up. It jumps from 0 to 120 LPM immediately when the part reaches 850°C.

---

## 2. Quality & Safety Logic

A part is classified based on where its **Peak/Average** parameters fall during the cycle.

### A. Water Flow (LPM)

*Controls Quench Rate*

| Range | Status | Result / Reason | Logic |
| :--- | :--- | :--- | :--- |
| **80 - 150** | **OK** | Good Part | Sufficient cooling. |
| **50 - 80** | **NG** | **SOFTNESS** | Cooling too slow. |
| **< 50** | **DOWN** | **Pump Failure** | Flow too low to operate safely. |
| **> 150** | **NG** | **CRACKING** | Cooling too aggressive (Thermal Shock). |

### B. Water Temperature (°C)

*Controls Quench Severity*

| Range | Status | Result / Reason | Logic |
| :--- | :--- | :--- | :--- |
| **25 - 32** | **OK** | Good Part | Optimal quenching temp. |
| **32 - 50** | **NG** | **SOFTNESS** | Water too hot to cool effectivey. |
| **> 50** | **DOWN** | **Scalding Risk** | Water dangerously hot. |
| **< 25** | **NG** | **CRACKING** | Water too cold (Thermal Shock). |

### C. Quench Pressure (Bar)

*Controls Vapor Barrier Penetration*

| Range | Status | Result / Reason | Logic |
| :--- | :--- | :--- | :--- |
| **2.0 - 4.0** | **OK** | Good Part | Optimal pressure. |
| **1.0 - 2.0** | **NG** | **SOFTNESS** | Pressure too low (Spotty hardening). |
| **< 1.0** | **DOWN** | **Complete Loss** | Hose disconnected or major leak. |
| **4.0 - 6.0** | **NG** | **CRACKING** | Pressure too high (Distortion). |
| **> 6.0** | **DOWN** | **Hose Burst** | Catastrophic failure. |

### D. Part Temperature (Peak °C)

*Controls Material Hardness*

| Range | Status | Result / Reason | Logic |
| :--- | :--- | :--- | :--- |
| **830 - 870** | **OK** | Good Part | Target 850°C reached. |
| **< 830** | **NG** | **UNDERHEATED** | Power too low or Heat time too short. |
| **> 870** | **NG** | **OVERHEATED** | Power too high (Grain Growth). |

---

## 3. Machine Health Counters

### Coil Life

* **Start**: 200,000
* **Direction**: Counts **DOWN** (Decrements by 1 per part).
* **Failure**: **Coil Failure** (Breakdown) when Count <= 0.

### Electrical & Mechanical Limits

* **Inverter Overcurrent**: Triggered if **Power > 80.0 kW** (Shift + Instant Stop).
* **Servo Overload**: Triggered if **Scan Speed < 5.0 mm/s** (Mechanical Jam).

---

## 4. Part ID Logic

* **Tracking**: The system waits until the cycle is fully `COMPLETED` (Unloading finished) to log the data.
* **Logging**: The **Correct Part ID** (the one that just finished) is locked in before generating a new ID for the next part. This ensures that a subsequent Breakdown log does not confuse the ID of the completed part.
