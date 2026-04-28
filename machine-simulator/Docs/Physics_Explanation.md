# Physics Logic Explanation

This document explains the mathematical model used in the **Induction Hardening Machine Simulator**.

## The Core Concept
The simulator uses a discretized implementation of **Newton's Law of Cooling** (and Heating). instead of complex Finite Element Analysis (FEA), we use a "Lumped Capacitance Model".

This means we treat the entire metal part as a single point that holds heat.

## The Formula
Every second (1 Hz), the new temperature is calculated using this formula:

$$ T_{new} = T_{old} + \Delta T_{heat} - \Delta T_{quench} - \Delta T_{loss} + \text{Noise} $$

Where:
*   **$T_{old}$**: The temperature at the previous second.
*   **$\Delta T_{heat}$**: Energy added by the Induction Coil.
*   **$\Delta T_{quench}$**: Energy removed by the Water Spray.
*   **$\Delta T_{loss}$**: Natural energy lost to the room air.

---

## 1. Heating Logic ($\Delta T_{heat}$)
When the Induction Coil is ON, it dumps energy into the part.

$$ \Delta T_{heat} = P_{kW} \times C_{heat} $$

*   **$P_{kW}$**: Power input (e.g., 50 kW).
*   **$C_{heat}$**: Heating Coefficient (Set to **5.0**).
    *   *Meaning*: For every 1 kW of power, the temp rises by 5°C per second (if no cooling).

## 2. Quenching Logic ($\Delta T_{quench}$)
When the Water Spray is ON, it removes energy rapidly.

$$ \Delta T_{quench} = F_{flow} \times C_{cool} $$

*   **$F_{flow}$**: Water Flow Rate (e.g., 120 LPM).
*   **$C_{cool}$**: Cooling Coefficient (Set to **0.8**).
    *   *Meaning*: For every 1 liter/min of water, the temp drops by 0.8°C per second.

## 3. Ambient Loss Logic ($\Delta T_{loss}$)
Hot objects naturally cool down to reach room temperature (25°C). The hotter the object, the faster it loses heat.

$$ \Delta T_{loss} = C_{loss} \times (T_{old} - T_{ambient}) $$

*   **$C_{loss}$**: Loss Coefficient (Set to **0.05**).
*   **$T_{ambient}$**: Room Temperature (25°C).

## 4. Noise (Sensor Jitter)
Real sensors are never perfect. We add a random "flicker" to make the data realistic for AI training.

$$ \text{Noise} = \text{Random}(-0.5, +0.5) $$

---

## Example Calculation
**Scenario**:
*   Current Temp: **100°C**
*   Power: **50 kW** (Heating ON)
*   Water: **0 LPM**

**Step-by-Step**:
1.  **Heat Gain**: $50 \times 5.0 = +250$
2.  **Quench Loss**: $0 \times 0.8 = 0$
3.  **Natural Loss**: $0.05 \times (100 - 25) = 3.75$

$$ T_{new} = 100 + 250 - 0 - 3.75 = \mathbf{346.25^\circ C} $$

The part heats up very fast because the induction power is massive compared to the natural cooling.
