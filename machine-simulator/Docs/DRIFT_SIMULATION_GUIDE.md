# 🔬 Drift Simulation Guide

> **For Demo Presenters & New Team Members**
> This guide explains how the AI detects machine failures BEFORE they happen.

---

## 🎯 What is Drift?

**Drift** is when a machine parameter slowly changes over time — like a tire slowly losing air. The value looks "fine" at any single moment, but it's heading toward failure.

### The Key Insight

| Traditional Monitoring                     | AI Drift Detection                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| "Pressure is 3.2 Bar — OK!"                | "Pressure is 3.2 Bar, but dropping at 0.75 Bar/min — **ALERT!**"        |
| Reacts to problems                         | **Predicts** problems                                                   |
| Catches failures                           | **Prevents** failures                                                   |

---

## 🏭 The Machine We're Simulating

### Induction Hardening 101

We simulate an **induction hardening machine** that:

1. **HEATS** a metal part using electromagnetic induction (like a microwave)
2. **QUENCHES** it with high-pressure water spray to harden the surface

```text
[Part Enters] → [Heating Coil] → [Quench Spray] → [Hard Part Exits]
                    850°C            Water Jets
```

### Why Pressure Matters

During quenching, **pressurized water** must:

- Break through the steam layer (vapor blanket) around the hot part
- Cool the surface rapidly and evenly
- Achieve the right hardness

| Pressure                       | Result                                        |
| ------------------------------ | --------------------------------------------- |
| **Too Low** (< 3.0 Bar)        | Water can't penetrate steam → **SOFT** part   |
| **Just Right** (3.0-4.0 Bar)   | Perfect cooling → Good part ✅                |
| **Too High** (> 4.0 Bar)       | Thermal shock → **CRACKED** part              |

---

## 🔴 The "Slow Leak" Scenario

### What We Simulate

A **hydraulic leak** in the quench system — like a cracked seal or loose fitting.

```text
Normal:     [Pump] ═══════════════════► [Spray Nozzles]
                        3.5 Bar

With Leak:  [Pump] ═══╗ drip 💧
                      ╚═══════════════► [Spray Nozzles]
                        3.5 → 3.0 → 2.5 Bar (dropping!)
```

### Real-World Causes

| Failure Type    | What Happens                      | How Fast       |
| --------------- | --------------------------------- | -------------- |
| O-ring wear     | Seal degrades from heat           | Days to weeks  |
| Fitting loosens | Vibration shakes connection       | Hours          |
| Cracked hose    | Fatigue from pressure cycles      | Hours          |
| Burst hose      | Catastrophic                      | Instant        |

We simulate the **middle ground** — fast enough for a demo, realistic enough to match real failures.

---

## 📊 The Numbers

### Drift Timeline (Demo Mode)

| Time       | Pressure       | Status        | What AI Sees                           |
| ---------- | -------------- | ------------- | -------------------------------------- |
| 0:00       | 3.5 Bar        | ✅ OK         | "All normal"                           |
| 0:30       | 3.1 Bar        | ✅ OK         | "Drift detected: -0.75 Bar/min"        |
| **1:00**   | **2.75 Bar**   | ⚠️ **NG**     | "**CRITICAL:** Pressure failing!"      |
| 1:30       | 2.4 Bar        | ⚠️ NG         | "Multiple NG parts produced"           |
| **2:00**   | **2.0 Bar**    | 🛑 **DOWN**   | "Machine stopped"                      |

### The Math

```text
Starting Pressure:     3.5 Bar
NG Threshold:          3.0 Bar (parts become soft)
DOWN Threshold:        2.0 Bar (machine stops)

Drop per minute:       0.75 Bar/min

Time to NG:           (3.5 - 3.0) ÷ 0.75 = ~40 seconds
Time to DOWN:         (3.5 - 2.0) ÷ 0.75 = ~2 minutes
```

---

## 🧠 How the AI Detects It

### Step 1: Collect Data

The AI watches the last 60 pressure readings from the database:

```text
Readings: [3.50, 3.48, 3.45, 3.42, ..., 3.10, 3.08, 3.05]
                                         ↓
                              Clearly trending DOWN
```

### Step 2: Calculate Drift Velocity

Using linear regression (fitting a line through the points):

```text
                Pressure
                   │
              3.5  │ •
                   │   •
              3.3  │     •
                   │       •
              3.1  │         •  ← Slope = -0.75 Bar/min
                   │           •
              2.9  │             •
                   └──────────────────► Time

Drift Velocity = Slope of this line
```

### Step 3: Classify Risk

| Drift Velocity     | Classification   | Dashboard Color   |
| ------------------ | ---------------- | ----------------- |
| -0.01 to +0.01     | OPTIMAL          | 🟢 Green          |
| -0.03 to -0.01     | WARNING          | 🟡 Yellow         |
| -0.05 to -0.03     | HIGH RISK        | 🟠 Orange         |
| < -0.05            | **CRITICAL**     | 🔴 Red            |

Our demo produces **-0.75 Bar/min** → Instantly classified as **CRITICAL**!

---

## 🎮 How to Run the Demo

### Step 1: Start Everything

```bash
# Terminal 1: Backend
cd Machine-Simulator
uvicorn backend.main:app --reload

# Terminal 2: Frontend
cd Machine-Simulator/frontend
npm run dev
```

### Step 2: Open the Simulator

Go to: <http://localhost:5173>

### Step 3: Start Production

1. Click **"START CYCLE"** — Machine begins making parts
2. Watch the gauges — Everything is green, parts are OK

### Step 4: Trigger the Drift

1. Find the purple button: **"Simulate Slow Hydraulic Leak"**
2. Click it
3. Watch the AI Dashboard

### Step 5: Observe the AI Detection

| Time    | What You'll See                            |
| ------- | ------------------------------------------ |
| 0:00    | AI shows "OPTIMAL" (green)                 |
| ~20s    | AI shows "WARNING" — drift detected!       |
| ~40s    | AI shows "CRITICAL" — NG parts starting    |
| ~1:30   | Machine produces multiple NG parts         |
| ~2:00   | Machine goes DOWN                          |

### Step 6: Repair

Click **"Stop Drift & Repair"** or **"REPAIR"** button to:

- Clear the leak
- Return machine to normal
- Resume production

---

## 🔧 Under the Hood

### File Locations

| File                                         | Purpose                                      |
| -------------------------------------------- | -------------------------------------------- |
| `backend/simulation/machine.py`              | Contains `start_slow_leak()` function        |
| `backend/simulation/failure_manager.py`      | Checks if pressure is in NG/DOWN range       |
| `backend/routers/simulation.py`              | API endpoint `/start-drift-test`             |
| `frontend/src/components/FaultControl.jsx`   | The purple button UI                         |

### Key Code: Starting the Drift

```python
def start_slow_leak(self):
    # Set drift direction and speed
    drift_rate = -0.0025  # Bar per tick (200ms)

    # Activate drift on pressure parameter
    self.active_drift = {"param": "pressure", "rate": drift_rate}
    self.accumulated_drift = 0.0  # Start from zero
```

### Key Code: Checking for NG

```python
def check_health(self, telemetry):
    pressure = telemetry.get('pressure', 0)

    if pressure < 3.0:  # NG threshold
        return {"status": "NG", "reason": "SOFTNESS (Low Pressure)"}

    if pressure < 2.0:  # DOWN threshold
        return {"status": "DOWN", "reason": "Severe Pressure Drop"}

    return {"status": "OK"}
```

---

## ❓ FAQ

### Q: Why does low pressure cause "SOFTNESS"?

**A:** When water pressure is too low, the spray can't break through the steam layer (vapor blanket) that forms around the 850°C part. This causes:

- Slower cooling
- Incomplete hardening
- A "soft" surface that won't meet specs

### Q: Why don't we simulate other failures?

**A:** We can! The system also supports:

- **Pump failure** (flow drops)
- **Power surge** (overheating)
- **Servo jam** (speed drops)
- **Cooling failure** (water temp rises)

The "Slow Leak" was chosen because it best demonstrates **gradual drift detection**.

### Q: How is this different from the instant fault buttons?

**A:** See the comparison below:

| Instant Fault                    | Slow Drift                            |
| -------------------------------- | ------------------------------------- |
| Jumps straight to NG/DOWN        | Gradual progression                   |
| Tests "did AI catch it?"         | Tests "did AI **predict** it?"        |
| Simulates catastrophic failure   | Simulates wear/degradation            |

### Q: Why 1 minute to NG instead of 10 minutes?

**A:** This is **Demo Mode** — fast enough to show in a meeting. Real industrial drift would be slower, but the AI detection works the same way.

---

## 📈 Key Takeaways for Your Presentation

1. **AI sees TRENDS, not just VALUES** — It catches problems before they become failures

2. **Drift velocity is the key feature** — How fast is the parameter changing?

3. **30-60 second advantage** — AI alerts BEFORE the first NG part is made

4. **Predictive, not reactive** — Traditional monitoring waits for failure; AI prevents it

5. **Industry-relevant scenario** — Hydraulic leaks are a real problem in manufacturing

---

## 📞 Need Help?

- Check the main README for setup instructions
- Look at `backend/simulation/machine.py` for the drift logic
- API docs at <http://localhost:8000/docs>

---

Document Version: 1.0 | Last Updated: January 2026
