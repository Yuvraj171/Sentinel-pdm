# 🎯 Drift Demo - Quick Reference Card

> **Print this for live demos!**

---

## ⚡ 60-Second Setup

```bash
# Start backend
uvicorn backend.main:app --reload

# Start frontend
cd frontend && npm run dev

# Open browser
# http://localhost:5173
```

---

## 🎮 Demo Script

| Step | Action                                   | What to Say                                                      |
| :--- | :--------------------------------------- | :--------------------------------------------------------------- |
| 1    | Click **START CYCLE**                    | "Machine is now producing parts normally"                        |
| 2    | Point to gauges                          | "All parameters are in the green zone"                           |
| 3    | Click **Simulate Slow Hydraulic Leak**   | "Now I'm introducing a simulated hydraulic leak..."              |
| 4    | Wait 30 seconds                          | "Watch the AI dashboard — it's already detecting the drift!"     |
| 5    | Wait for NG                              | "The AI predicted this failure 30 seconds before it happened"    |
| 6    | Click **REPAIR**                         | "Operator fixes the leak, production resumes"                    |

---

## ⏱️ Timeline Cheat Sheet

```text
0:00  ─────  Start drift (pressure = 3.5 Bar)
             │
0:30  ─────  AI detects drift (still making OK parts!)
             │
1:00  ─────  First NG parts (pressure < 3.0)
             │
2:00  ─────  Machine breakdown (pressure < 2.0)
```

---

## 💬 Key Talking Points

### "What makes this AI special?"

> "Traditional systems alert when something IS wrong.
> Our AI alerts when something is GOING wrong."

### "How does it work?"

> "The AI calculates drift velocity — how fast the pressure is changing.
> Even when pressure looks OK at 3.2 Bar, the AI sees it's dropping at 0.75 Bar per minute."

### "Why does this matter?"

> "We get a 30-60 second warning before the first bad part.
> That's enough time to stop production and fix the issue — zero scrap, zero downtime."

---

## 🔢 Numbers to Remember

| Metric              | Value            |
| ------------------- | ---------------- |
| Normal pressure     | 3.0 - 4.0 Bar    |
| AI threshold        | -0.05 Bar/min    |
| Demo drift rate     | -0.75 Bar/min    |
| Time to first NG    | ~1 minute        |
| Time to breakdown   | ~2 minutes       |

---

## ❌ If Something Goes Wrong

| Problem                  | Fix                             |
| ------------------------ | ------------------------------- |
| AI not detecting         | Check backend is running        |
| No parts being made      | Click START CYCLE               |
| Drift not working        | Restart backend, try again      |
| Machine stuck on DOWN    | Click REPAIR then RESET         |

---

## 🎤 Demo Closing

> "In manufacturing, catching a failure 1 minute early can save:
>
> - Thousands of dollars in scrap
> - Hours of unplanned downtime
> - Your customer's trust
>
> That's the power of AI-driven predictive maintenance."

---

Keep this card handy during presentations!
