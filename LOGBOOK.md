# LOGBOOK.md — Sentinel-PdM engineering incidents

Narrative log of problems we hit during the sprint, why they happened, and the generalizable lesson from each. Different from the other workspace files:

- [CLAUDE.md](CLAUDE.md) — system spec ("how it works")
- [DECISIONS.md](DECISIONS.md) — locked architectural choices ("don't re-litigate")
- [SPRINT.md](SPRINT.md) — day-by-day plan ("what we do when")
- [audit_notes.md](audit_notes.md) — starting-state audit ("what we found before we touched anything")
- **LOGBOOK.md (this file)** — incidents and what we learned from them

## Entry structure

Each entry answers four questions:

- **What happened** — the symptom we observed
- **Why it happened** — the root cause, no euphemisms
- **How we fixed it** — the actual change
- **Takeaway** — the generalizable lesson worth remembering

If an entry's takeaway is weak, the incident probably wasn't worth logging.

---

## Day 1 — Malformed `.env` (silent corruption that loaded "fine") — 2026-04-27

**What happened:** While reading the workspace [.env](.env) to plan the `pydantic-settings` work, I noticed the first two lines were `# In sentinel-pdm-workspace/` and `cat > .env << 'EOF'`, and the last line was just `EOF`. The shell heredoc command from CLAUDE.md's setup section was sitting inside the `.env` file as literal content. The same pattern appeared at the bottom of [.gitignore](.gitignore) (a stray `EOF` line). Despite this, `python-dotenv` loaded `DATABASE_URL` correctly — the simulator would have started fine. The corruption was invisible to runtime.

**Why it happened:** Setup instructions in [CLAUDE.md](CLAUDE.md) showed the `.env` content using a bash heredoc:

```bash
cat > .env << 'EOF'
DATABASE_URL=...
EOF
```

That's meant to be **executed in a terminal**, where bash interprets the heredoc and writes only the lines *between* the EOF markers into the file. When pasted into a text editor instead, the literal lines `cat > .env << 'EOF'` and `EOF` become part of the file. `python-dotenv`'s default behavior is to silently skip lines without `=`, so the malformed lines disappeared at parse time without warning. Two things conspired: (1) documentation written terminal-shaped, not editor-shaped, and (2) a parser that's *forgiving* about typos — and therefore complicit in hiding them.

**How we fixed it:** Rewrote both `.env` and `.gitignore` to contain only their intended content (KEY=VALUE pairs / ignore patterns). No code changes. The bug was caught by reading the file, not by anything breaking.

**Takeaway:**
- **Forgiving parsers hide setup mistakes.** The first thing to run on a freshly-cloned workspace isn't `python -c "from x import y"` — it's `cat .env` and read the file. Loaders don't fail when they should.
- **Setup docs that contain heredocs are a footgun.** Prefer a `bash setup.sh` script (or a literal example file like `.env.example`) — scripts can't be misinterpreted; heredocs in prose can.
- **Bugs that don't break runtime are worse than bugs that do.** Visible failures get fixed; silent ones rot. When designing config loaders, prefer "fail loud on unknown line" over "silently skip" by default — the inverse of what dotenv does.

---

## Day 1 — Missing `greenlet`, uvicorn died at startup — 2026-04-27

**What happened:** As the final smoke test of Day 1, after every static check had passed (grep, `from backend.config import settings` import test, three fail-loud validator tests), I ran `uvicorn backend.main:app` against the running Postgres container. The process died inside FastAPI's lifespan handler with:

```
ValueError: the greenlet library is required to use this function. No module named 'greenlet'
```

The traceback was inside `sqlalchemy/util/concurrency.py` — specifically, the `engine.begin()` call in [main.py:9](machine-simulator/backend/main.py#L9). Nothing the static checks could have flagged.

**Why it happened:** SQLAlchemy 2.x makes `greenlet` an *optional* runtime dependency, expressed via the `[asyncio]` extra in its package metadata. When you `pip install sqlalchemy`, you get the sync engine fully working — no greenlet needed. The async engine code only fails at the point of first use, where it does a runtime import check for greenlet and raises the `ValueError` you saw if it's missing.

The maintainer logic for this design: most SQLAlchemy users don't do async. Forcing every user to install `greenlet` (a C extension that has to be compiled per platform, occasionally with wheel-availability issues) just to use sync ORM adds a real install burden. Putting it behind an extra means the cost is paid only by users who opt in to async — they have to remember `sqlalchemy[asyncio]`. The trade-off is exactly the bug we hit: people who *do* want async but forget the extra get a clean runtime error the first time they touch the async engine.

The original [requirements.txt](machine-simulator/backend/requirements.txt) declared bare `sqlalchemy`. On x86_64 Linux with denser dep chains, `greenlet` often gets pulled transitively by some other package (gevent, eventlet, certain flavor of celery, etc.) and the missing-extras bug never surfaces. On Apple Silicon with this minimal dep set, nothing else pulled it — so async SQLAlchemy was technically uninstalled while pretending to be installed.

**How we fixed it:** Changed `sqlalchemy` to `sqlalchemy[asyncio]` in [machine-simulator/backend/requirements.txt](machine-simulator/backend/requirements.txt), reran `pip install -r`. The `[asyncio]` extra resolved to `greenlet 3.5.0`. Uvicorn booted in 1 second on retry; `Base.metadata.create_all()` created `sim_runs` and `telemetry` in Postgres; `/health` returned the expected JSON. One-line diff, no code change.

This was a **beyond-plan tweak** — the Day 1 plan (DECISIONS.md D2 cleanup) didn't anticipate it. It surfaced only because we ran an actual smoke test instead of stopping at the static checks.

**Takeaway:**
- **Static checks have a hard ceiling.** `grep`, import tests, and validator tests all passed before this. None of them could have caught it — the missing module is referenced inside SQLAlchemy's async engine, and Python doesn't load that path until the engine is actually *used*. **A "loads cleanly" test is not the same as a "running and serving" test.** Every service needs both.
- **Optional deps are silent until they aren't.** When depending on a package whose features are gated behind extras (sqlalchemy, fastapi, httpx, redis, pandas, uvicorn all do this), the extras are part of your dependency contract. Bare-name installs give you the *minimum* the package thinks any user might want — not what your code actually needs. Always declare the extras for the features you use.
- **"Works on my machine" lives in this gap.** Reproducibility is fragile when it depends on what *else* got pulled into the env. Being explicit about extras is the cheapest defense.

---

## Day 1 — SQLite fallback removal (decision execution, not an incident) — 2026-04-27

Per [DECISIONS.md D2](DECISIONS.md), the SQLite fallback in [machine-simulator/backend/database.py](machine-simulator/backend/database.py) was removed and `aiosqlite` dropped from requirements. The new fail-loud validator in [config.py](machine-simulator/backend/config.py) explicitly rejects any `sqlite` URL with a D2 citation. Logged here for completeness; not a story with a takeaway because the decision was already made — Day 1 just executed it.

---
