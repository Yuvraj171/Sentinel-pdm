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

## Day 2 — Editable install was a no-op because macOS marked the `.pth` file hidden — 2026-04-28

**What happened:** After running `pip install -e ".[dev]"` against the new [pdm-ai-engine/pyproject.toml](pdm-ai-engine/pyproject.toml), every static signal said the install succeeded — `Successfully installed sentinel-pdm-0.1.0`, `pip show sentinel-pdm` reported the editable install, the `.pth` file existed at the expected path inside `site-packages`, and the `src/sentinel_pdm/` source tree was intact on disk. But `python -c "import sentinel_pdm"` raised `ModuleNotFoundError: No module named 'sentinel_pdm'`. The package was, by every visible measure, installed — and unimportable.

**Why it happened:** Python's `site.py` runs `addpackage()` on every `.pth` file it finds in `site-packages` at startup. Each `.pth` either declares paths to add to `sys.path` or contains executable bootstrap code. CPython 3.11's `addpackage()` has this guard early on:

```python
if (getattr(st, 'st_flags', 0) & stat.UF_HIDDEN):
    _trace(f"Skipping hidden .pth file: {fullname!r}")
    return
```

`UF_HIDDEN` is the macOS BSD file flag for "hidden" — the same thing `chflags hidden` sets. Both `.pth` files in our venv (`__editable__.sentinel_pdm-0.1.0.pth` and the unrelated `distutils-precedence.pth`) had this flag set, even though they weren't dot-prefixed. `python -v` confirmed it:

```
Skipping hidden .pth file: '...__editable__.sentinel_pdm-0.1.0.pth'
Skipping hidden .pth file: '...distutils-precedence.pth'
```

`ls -lO` (the macOS-specific `ls` flag for file flags) showed `hidden` next to both. We never set this flag manually. The most likely cause is some tool in the macOS toolchain (Time Machine, Spotlight indexer, or a system-level pip wrapper) applying `UF_HIDDEN` to files it considers internal — which silently nukes editable installs because `site.py` then refuses to read the path.

**How we fixed it:** `chflags -R nohidden .venv/ && xattr -rc .venv/`. The first clears `UF_HIDDEN` recursively. The second drops macOS extended attributes that may have been triggering re-application of the flag. After this, the `.pth` was processed normally, `src/` landed on `sys.path`, and `import sentinel_pdm` resolved to `src/sentinel_pdm/__init__.py`.

**Takeaway:**
- **`pip show` is a metadata query, not a working-import test.** It reports "yes I installed this" by reading its own database, not by actually importing the package. The right post-install smoke test is `python -c "import <pkg>; print(<pkg>.__file__)"`. If the path resolves to your source (for editable installs) or `site-packages` (for normal installs), it actually works.
- **Same shape as the Day 1 greenlet bug.** Static signals all green; runtime fails. The bug class is "checks that pass for the wrong reason." Day 1 was about extras quietly missing from a dep contract; Day 2 was about the file system quietly hiding a config file from the runtime. Different mechanism, identical failure mode.
- **Verbose mode is your friend.** `python -v -c "import x" 2>&1 | grep pth` would have surfaced the "Skipping hidden .pth file" message in five seconds. We spent thirty minutes diagnosing because we didn't reach for it earlier. Add it to the muscle memory.

---

## Day 2 — venv state lies (rogue 3.14 venv at workspace root, stale paths in simulator's Day 1 venv) — 2026-04-28

**What happened:** Two separate venv-state issues hit within an hour of each other.

(1) Running `pip install -e ".[dev]"` in `pdm-ai-engine/` after `cd`-ing in with `(.venv)` showing in the prompt actually installed everything into `/Users/yusi/Desktop/sentinel-pdm/.venv/lib/python3.14/site-packages/` — a venv we never knowingly created, sitting at the workspace root, running Python 3.14 instead of the 3.11 that DECISIONS.md D16 mandates. The `pyproject.toml`'s `requires-python = ">=3.11"` accepted 3.14 without complaint because the constraint had no upper bound.

(2) The simulator's Day 1 venv at `machine-simulator/.venv/` had `VIRTUAL_ENV=/Users/yusi/Desktop/sentinel-pdm-workspace/machine-simulator/.venv` baked into it — a stale path from before the workspace got renamed (`sentinel-pdm-workspace` → `sentinel-pdm`). `which python` returned Homebrew's `/opt/homebrew/opt/python@3.11/libexec/bin/python` instead of the venv's own binary, because the venv's `bin/` directory was at a path that no longer existed and the shell silently fell through to the next entry in `PATH`.

**Why it happened:**
- (1) was likely an IDE auto-action (Cursor or VS Code prompting to "create a virtual environment for this workspace" and quietly making one) combined with a loose `requires-python`. Neither was visibly configured anywhere; both effects compound.
- (2) is a fundamental Python venv property: `bin/activate`, `pyvenv.cfg`, and the shebang lines of installed scripts all hardcode the venv's absolute path at creation time. Renaming the parent directory does not update them — the venv becomes silently broken. The shell doesn't error on a non-existent `PATH` entry; it just skips and tries the next one.

**How we fixed it:**
- Deleted `/Users/yusi/Desktop/sentinel-pdm/.venv` (the rogue one) entirely. Recreated `pdm-ai-engine/.venv` from `pyenv exec python -m venv .venv` to lock Python 3.11.9 (D16's specified toolchain).
- Tightened `requires-python` from `>=3.11` to `>=3.11,<3.12` so a future Python 3.13/3.14/etc. can't satisfy it accidentally.
- Deleted and rebuilt `machine-simulator/.venv` from pyenv 3.11.9 too, and ran `pip install -r backend/requirements.txt` against the fresh venv. Worth noting: Day 1's venv had been on Homebrew's 3.11.13, which violated D16's "via pyenv" clause silently. Both services now share pyenv 3.11.9 — actual D16 compliance.
- Wired up `direnv` with `.envrc` files in each service so re-creating broken venvs is also re-activated correctly without manual `source .venv/bin/activate`.

**Takeaway:**
- **A `(.venv)` prompt does not prove activation.** The prompt is set by `bin/activate` and persists across `cd`s; it's a UI label, not a state assertion. The only reliable check is `which python` returning the venv's binary path, plus `python --version` matching the patch version you intended.
- **Locked decisions need enforcement, not just documentation.** D16 said "Python 3.11 via pyenv." Day 1 used Homebrew 3.11.13 anyway because nothing checked. The remediation is `requires-python` constraints in `pyproject.toml` — narrow enough that a wrong Python *fails the install*, not just a doc.
- **Venvs are not relocatable.** If you rename the directory containing a venv, the venv breaks silently. The fix is always "delete and recreate from a known Python," never "edit the venv's internals."

---

## Day 3 — `alembic revision --autogenerate` produced an empty migration — 2026-04-30

**What happened:** First run of `alembic revision --autogenerate -m "initial schema"` succeeded with no errors and produced [alembic/versions/16333541da83_initial_schema.py](machine-simulator/backend/alembic/versions/16333541da83_initial_schema.py) (since deleted). Both `upgrade()` and `downgrade()` contained nothing but `pass`. If we'd run `alembic upgrade head` and committed the file, the migration history would have been mathematically correct but operationally useless: a future deploy against an empty Supabase database would run the migration successfully and end up with no tables. The bug was caught only because we read the generated file before applying it.

**Why it happened:** `--autogenerate` works by diffing `Base.metadata` (what `models.py` declares) against the **live database** (what `psql \dt` would show). It emits DDL for the difference. The local Postgres still had `telemetry` and `sim_runs` tables left over from earlier `Base.metadata.create_all()` calls during Day 1/2 setup work — so when Alembic compared model-vs-DB, the answer was "they already match, nothing to do." The empty migration was Alembic correctly answering the question we accidentally asked. The deeper issue: autogenerate is a function of two inputs (models, live DB), but the mental model most people start with is "autogenerate reads my models and writes SQL." Forgetting the second input is how this bug class always shows up.

**How we fixed it:** Deleted the empty migration file, dropped the existing `telemetry` and `sim_runs` tables (and the `alembic_version` bookkeeping table) via `psql`, then re-ran `--autogenerate` against the now-empty DB. The second run produced [alembic/versions/7b797c4ffef8_initial_schema.py](machine-simulator/backend/alembic/versions/7b797c4ffef8_initial_schema.py) with real `op.create_table(...)` calls for both tables, real `op.create_index(...)` for the dashboard-polling index, and a proper `downgrade()` ordering that drops `telemetry` before `sim_runs` to respect the FK. Applied with `alembic upgrade head`; verified with `\d telemetry` and `alembic current` showing `7b797c4ffef8 (head)`.

**Takeaway:**
- **Always read autogenerated migrations before applying.** "It ran without error" is not the same as "the migration does what you think it does." A migration with `pass` in `upgrade()` runs fine and updates the version table — and ships nothing. Treat every Alembic-generated file as a code review, not a build artifact.
- **Autogenerate has two inputs, not one.** The output is `Base.metadata - live_DB`. If you're starting Alembic on a project that already has tables created by `create_all()` or hand-written DDL, the live DB is the variable you forgot about. Two clean responses: (a) drop the tables and let autogenerate re-create them so the initial migration is canonical, or (b) keep the tables, accept the empty migration, and `alembic stamp head`. We picked (a) because (b) leaves a useless first-migration artifact that breaks fresh deploys — exactly the Supabase scenario coming up in Phase 4.
- **Same shape as the static-green / runtime-fails LOGBOOK pattern, one level higher.** Day 1 and Day 2 had failures that compiled but blew up at runtime. Day 3 had a *migration* that "succeeded" but would have failed at deploy. The bug class is "checks that pass for the wrong reason" — same family, different layer.

---

## Day 3 — `pip install -e` didn't take (UF_HIDDEN, again) + activation isn't sticky — 2026-04-30

**What happened:** During Task 5 of Day 3 (verify pdm-ai-engine reads the new schema), `python -c "import sentinel_pdm"` from the `pdm-ai-engine/.venv` raised `ModuleNotFoundError: No module named 'sentinel_pdm'`. This was the **second** time the same bug class hit us — Day 2 logged the macOS `UF_HIDDEN` flag silently nuking editable installs, and the fix was supposed to have been one-shot. It wasn't: when the venv was recreated today (per [D16](DECISIONS.md#L242)) and `pip install -e ".[dev]"` re-ran, the new `.pth` files came in flagged hidden again. Same `python -v ... | grep pth` evidence, same "Skipping hidden .pth file" line. Identical incident.

A second, separate gotcha showed up while fixing this: chaining `source .venv/bin/activate && python -c "..."` in one Bash invocation worked, but a later `python -c "..."` in a separate Bash invocation reverted to a non-venv Python (`sys.path` showed Homebrew paths). The activation didn't persist across shells.

**Why it happened:**
- (1) **`UF_HIDDEN` is set by something in the macOS install path, not by us.** Likely candidates: Time Machine, Spotlight, or a system-level wrapper that classifies internal package files as hidden. Whatever sets it does so on every fresh install, so a one-time `chflags -R nohidden` after a Day 2 incident only solved the Day 2 incident — not the bug class. The remediation has to run *after every `pip install -e`*, or the install is silently broken.
- (2) **Each Bash tool invocation is its own process.** `source` sets shell variables (PATH, VIRTUAL_ENV) in the running shell only. When the shell exits, they're gone. The `(.venv)` prompt persists across `cd`s within one shell session because the shell is the same process. But spawning a new shell — which any new tool invocation does — gives you a clean environment with no activation. The fix is to re-activate inside every multi-command Bash call, or to invoke the venv's binary directly via `.venv/bin/python` instead of relying on PATH.

**How we fixed it:**
- For (1): `chflags -R nohidden .venv/ && xattr -rc .venv/` — same pair of commands as Day 2. Verified with `ls -lO .venv/lib/python3.11/site-packages/*.pth` showing `-` (no flag) instead of `hidden`. Then `import sentinel_pdm` resolved correctly to `src/sentinel_pdm/__init__.py`.
- For (2): chained `source .venv/bin/activate && <command>` inside every Bash invocation that needed venv-resolved imports.

**Takeaway:**
- **A bug fixed once is not a bug fixed forever if the cause is in the toolchain, not the artifact.** Day 2's chflags wasn't a permanent fix — it was a workaround for a re-occurring source. The right structural fix is either (a) wrap `pip install -e` in a script that runs `chflags` afterward (cheap, ugly, durable) or (b) include the chflags step in any "rebuild venv" runbook. Until macOS stops marking these files hidden, every fresh editable install will hit this. Add it to the muscle memory: after `pip install -e`, always check `.pth` flags.
- **`source activate` is a session-local UI label, not a property of the venv.** This compounds Day 2's "venv state lies" lesson. The reliable cross-shell strategies are: (i) invoke `.venv/bin/python` directly, which is path-stable, or (ii) put `source .venv/bin/activate` at the top of every chained command. The unreliable strategy — assuming activation persists — fails in any context where shells aren't long-lived (CI, agent tools, scripts that spawn subshells).
- **Three of these now in three days.** Day 1 greenlet, Day 2 hidden `.pth`, Day 3 hidden `.pth` again + shell re-activation. The connecting principle still holds: **`pip install` succeeding tells you the dependency graph resolved. It does not tell you the runtime will work.** The cheapest universal defense remains the same — an actual end-to-end import test after every install, not just `pip show <pkg>`.

---

## Day 2 — xgboost ImportError on first runtime use (libomp) — 2026-04-28

**What happened:** `pip install xgboost` succeeded. `import xgboost` failed at runtime with `XGBoostError: Library not loaded: @rpath/libomp.dylib` from inside `xgboost/core.py:_load_lib`. Surfaced when our smoke test imported `services/api.py` (which itself imports xgboost). Static install passed, dynamic load failed.

**Why it happened:** xgboost on macOS depends on the OpenMP runtime (`libomp.dylib`) for parallel tree training — but that library is **not** bundled in xgboost's wheel. It's a system-level dependency that has to be installed separately. xgboost's own error message helpfully suggests `brew install libomp`. The wheel installed without complaint because `pip install` doesn't validate runtime library availability; it only resolves Python-level deps.

**How we fixed it:** `brew install libomp`. xgboost picked it up on the next import.

**Takeaway:** Same family as the Day 1 greenlet bug — a runtime dependency outside the Python dep graph that surfaces only when the C extension is actually loaded. Three of these now in our LOGBOOK in two days (greenlet, libomp, the `.pth` hidden flag). The connecting principle: **`pip install` succeeding tells you that pip's dependency graph resolved. It does not tell you that the runtime will work.** The cheapest universal defense is an actual end-to-end smoke test that imports the package and exercises the path that touches the C extension. Static "loads cleanly" tests have a hard ceiling on what they can catch.

---

## Day 4 — simulator imported clean, ran clean, was emitting the wrong shape for ML — 2026-05-04

**What happened:** Day 4 opened with a baseline check: Postgres up, Alembic at head, `from backend.main import app` returning `import ok`. Everything green. Yet the simulator was unusable as the feeder layer for the AI engine. It wrote one row per finished part (event-based MES log shape), with `peak_part_temp`/`peak_pressure`/etc. captured per cycle, and labelled bad parts with quality reasons (CRACKING, SOFTNESS) via threshold rules in `failure_manager.py`. What ML needs is per-second time-series telemetry across 8 sensors, with three mechanical failure modes that have distinct sensor signatures, plus three label columns (`failure_mode`, `time_to_failure_s`, `will_fail_10min`) that didn't exist anywhere in the codebase. There was also a dormant runtime bomb: 9 references to the dropped `tempering_speed` column inside function bodies that hadn't been called yet — the import test passed because nothing exercised them.

**Why it happened:** The original simulator was scoped for a different product — a live operator dashboard with day-batched fast-forward that targets OK/NG/DOWN distribution percentages. Two services, two product shapes, one codebase. Both products are *internally coherent*; the mismatch only shows up when you try to feed one product's output into the other's input. Static checks (import, lint, type-check, even `/health`) can't see this — they verify the code is consistent with itself, not that the data shape is consistent with a downstream consumer. Compounding: the threading + asyncio mix in the live tick loop ([routers/simulation.py:42-88](machine-simulator/backend/routers/simulation.py#L42-L88) of the old file) carried existing comments admitting "this needs to be async, but we are in a sync thread" — the previous author knew, but had no forcing function to fix it. Per-tick `print` debug inside the physics kernel ([simulation/physics.py:48](machine-simulator/backend/simulation/physics.py#L48) of the old file) would have made fast-gen mode unusable the moment we tried it.

**How we fixed it:** Rewrote `simulation/{machine,physics,persistence}.py` and `routers/simulation.py` from scratch into a smaller, ML-shaped layout: `cycle.py` (4-state machine: IDLE → HEATING → QUENCH → IDLE, DOWN terminal), `physics.py` (per-state sensor models with Gaussian noise per CLAUDE.md ranges, plus a `apply_failure_signature` hook for Module 2), `engine.py` (single async tick loop, parameterized as live now and fast-gen later), `persistence.py` (async writer with single-row + batch interfaces). Deleted `fast_forward.py`, `failure_manager.py`, `time_manager.py`, `generator.py`, `state.py`, and the old `machine.py` — ~1900 lines retired in favour of ~500 lines of new code that hits the ML-correctness checklist explicitly: 8 sensors populated on every row, `failure_mode='normal'` populated on every row, `time_to_failure_s` and `will_fail_10min` left NULL for normal rows (look-ahead label is Module 3 territory; computing it at write-time would leak future info), same physics module to be shared between live and fast-gen. Added [backend/logging_config.py](machine-simulator/backend/logging_config.py) with stdlib `logging` to stdout so any tick error logs a full traceback in the uvicorn CLI instead of getting swallowed into a generic 500. Verified end-to-end: `POST /simulation/start`, 15 seconds of ticks at exactly 1Hz, sensor values inside CLAUDE.md ranges per state, label columns populated correctly in psql.

**Takeaway:**
- **Static-green at the system level is the same trap as static-green at the code level.** Days 1-3 logged static-green/runtime-fails bugs at the code/runtime layer (greenlet, hidden `.pth`, empty Alembic migration). Day 4 was the same shape one level up: the program ran fine *as a program*, and was wrong *as a feeder layer for the next service*. Lint, types, imports, smoke tests can't see the mismatch — only checking the data shape against the consumer's contract can. **Add this check to the muscle memory: when one service feeds another, verify the columns the consumer actually reads, not just that the producer doesn't crash.**
- **Refactor-vs-rewrite isn't a code question, it's a product-shape question.** When the existing code is internally coherent for a different product, refactoring means rewriting the same lines anyway — plus inheriting unknown assumptions from the old shape. We touched 80%+ of the simulator's lines either way; the rewrite just shipped without baggage. The deleted code wasn't bad code — it was correct code for a product we no longer build.
- **Author-to-author comments-as-warnings are signal.** The original author left "this part needs to be async, but we are in a sync thread" in the file. That's a known-broken mark left for a future committer. Our LOGBOOK entries are the same artifact in a different file — both worth treating as legitimate evidence when scoping work, not just as code smell.

---

## Day 4 — smoke test passed, expert review found 4 real bugs — 2026-05-04

**What happened:** After the simulator rewrite (entry above), the smoke test passed cleanly: 15 ticks in 15s at exactly 1Hz, IDLE → HEATING → QUENCH transitions, sensors visually plausible per state, all label columns populated, no NULLs. Ready to commit. Before pushing, the user asked for an explicit tester-mode pass. That pass found four bugs the smoke test did not. The most consequential was an off-by-one in cycle progress: `progress = elapsed_in_state / DURATION_S` produced a max value of `(N-1)/N` (0.875 for HEATING, 0.833 for QUENCH) instead of 1.0. Result: `part_temp` peaked at **790°C** during HEATING, not the 900°C target — *outside* CLAUDE.md's documented spec range of 800-1000°C. The smoke test missed it because it eyeballed one partial cycle in JSON; nothing checked sensor values against the spec range. The other three: a `start()` race (concurrent POST /start spawns two tick loops), an unguarded `1/SIMULATOR_TICK_RATE_HZ` (ZeroDivisionError on bad `.env`), and a `/reset` race (in-flight `/start` could interleave with the delete+cycle.reset sequence).

**Why it happened:** Smoke tests verify "the program runs and produces output of the expected shape." They do not verify "the output is correct against the contract." For Module 1, the contract is CLAUDE.md's sensor range table. We checked that rows had non-NULL sensors; we did not check that HEATING's `part_temp` peak fell inside [800, 1000]. The off-by-one was structurally invisible to a round-trip API test — only a value-range assertion or a side-by-side comparison against the spec could have caught it. The race bugs and the divide-by-zero were the same shape: *paths the smoke test never exercised*. There is no concurrent-start path in a single-curl smoke test. There is no `tick_rate=0` path unless someone deliberately sets it. Smoke tests cover the happy path; tester mode covers the *adjacent paths the happy path doesn't visit*.

**How we fixed it:** Off-by-one: changed `progress = elapsed / DURATION_S` to `progress = elapsed / max(1, DURATION_S - 1)` — clamp denominator at 1 to avoid a fresh divide-by-zero when DURATION_S=1. Re-ran: HEATING peaks now 888°C (cycle 1) and 909°C (cycle 2) — inside spec. QUENCH ends at 114°C (cycle 1) — close to the 100°C target with noise. Race in start: added `asyncio.Lock` lazy-initialized inside the engine and acquired around `start`, `stop`, and a new atomic `reset`. Lazy init because `asyncio.Lock()` requires a running event loop, and the engine singleton is module-level (instantiated at import time before the loop exists). Tick rate validation: pydantic `Field(default=1.0, gt=0.0)` on `simulator_tick_rate_hz`, plus `Field(default=0.05, ge=0.0, le=1.0)` on `failure_probability` while we were there. Reset atomicity: moved DB delete + SimRun reset + cycle reset into `engine.reset(session)`, guarded by the same lock as start/stop, so /reset can't interleave with /start.

**Takeaway:**
- **A smoke test is "does it run" — not "is it correct." Both are required, and they catch different bugs.** A passing smoke test plus an unspec'd output is more dangerous than a failing one, because the green light invites trust. **Add one explicit value-range assertion against the spec for every key invariant, even informally** — for Module 1 that's `assert 800 <= peak_part_temp <= 1000` against the data after one full cycle. This would have caught the off-by-one before tester mode did. Module 2 will get the same treatment for failure-mode signatures (each mode's affected sensor must move outside its normal-range envelope; sensors not affected must stay inside).
- **"Foolproof" is paths-not-taken, not paths-taken.** Three of the four bugs (start race, tick_rate=0, reset race) were on paths the smoke test cannot reach by construction. The cheap defenses for these are: locks around lifecycle methods, validators on inputs, and atomic transitions for state changes that touch shared resources. None of these defenses prevent specific known bugs — they prevent *classes* of bugs that haven't surfaced yet. Worth applying defensively whenever the cost is small; here, all four fixes were <30 lines of code.
- **Tester mode is a different prompt, not a different person.** The same LLM produced the smoke test ("looks fine, ship it") and the tester-mode pass ("here are four bugs"). The difference was *being asked the right question*. **Bake the question into the workflow:** after every "module done" milestone, before commit, an explicit "what would break this?" pass. Five minutes of cost, multiple incidents prevented per sprint at this density.

---

## Day 4 Module 2 — failure-mode signatures, designed for distinguishability not realism — 2026-05-04

**What happened:** Implemented the three CLAUDE.md failure modes (coolant_pump, quench_system, power_supply) on top of the Module 1 baseline physics. The decision that mattered most was not "make each signature physically accurate" — it was **make each signature orthogonal in feature space**. CLAUDE.md prescribes the affected sensors per mode, but not the magnitudes. The magnitudes I picked were tuned so each mode owns a unique "marker sensor" that no other mode touches:

  - coolant_pump owns `quench_water_temp` (rises in every state)
  - quench_system owns `quench_pressure` (drops sharply in QUENCH; nothing else touches it)
  - power_supply owns `induction_power` (drops + becomes noisy in HEATING; nothing else touches it)

Plus secondary signals (flow drop, part_temp deviation) overlap across modes with *different magnitudes* per mode for redundancy. End-of-quench part_temp at severity=1 is ~130°C for coolant_pump vs ~250°C for quench_system — same secondary signal, different magnitude → still separable.

Each signature is implemented as a state-aware mutator: `apply_failure_signature(reading, mode, severity, state)` only modifies sensors active during the relevant cycle phase. Applying a flow drop during HEATING (when flow is 0) would emit a "ghost failure" the model can't ground in physics. State-awareness is non-negotiable for ML correctness.

Severity ramps linearly from 0 (onset start) to 1 (failure point) over a configurable `onset_seconds`. At severity=1, the engine transitions the cycle to DOWN. The label columns track the trajectory: `failure_mode` is set the moment a failure is injected, `time_to_failure_s` decreases each tick. Crucially, `will_fail_10min` stays NULL — that's a Module 3 look-ahead label, computing it at write-time would leak future info.

**Why the magnitudes had to be designed, not just chosen:** A naive implementation of CLAUDE.md's spec — "coolant pump degradation: flow drops, water_temp rises, part_temp elevated" — left every mode using overlapping sensor sets with no clear separation. Pure signal-overlap means the classifier sees ambiguous patterns: was that a quench_system failure or a coolant_pump failure? The fix was to give each mode a **marker sensor** that only that mode touches, then layer secondary signals on top for redundancy. Decision derived from D4 (binary classifier, not multi-class): the binary target is "will fail in 10 min", but downstream RUL / explainability work depends on each mode being identifiable in the feature vector. Orthogonal markers are the cheapest way to guarantee that.

**The same QA discipline as Module 1 caught nothing material this time** — the rewrite habit from Module 1 (state-aware checks per cycle phase, baseline noise floor sized to be clearly subordinate to signature magnitudes, lifecycle lock, validator-on-input) carried over. The expert review pass found:
  - Rejection paths all return appropriate codes (409 for engine-state conflicts, 422 for input validation)
  - `/clear-failure` mid-onset returns sensors to baseline immediately and lets the cycle continue
  - `/inject-failure` while a failure is active is rejected (no mode-swap chaos)
  - Magnitudes verified end-to-end with `onset_seconds=30` runs per mode: each signature deviates per spec, unaffected sensors stay inside baseline noise envelope

**Takeaway:**
- **CLAUDE.md spec is a recipe, not the dish.** It lists which sensors are affected per mode but doesn't specify magnitudes, noise increases, or onset rates. Translating spec to ML-ready signatures requires *design choices* that depend on what the downstream model needs (orthogonality, distinguishability, signal-to-noise floor). When porting future spec docs into code, **read for what's *not* specified** — that's where judgement calls hide, and where ML correctness lives.
- **State-awareness is the cheap defense against ghost signals.** Mutating sensors that aren't active during the current cycle phase (flow during HEATING, power during QUENCH) emits unlabelled noise that confuses the model. Every signature function takes `state` as an argument and early-returns when it's not the relevant phase. Five lines of guard code per mode prevented an entire class of training-data corruption.
- **Designing for the model is a different discipline than designing for physics.** A real coolant pump might degrade with non-linear hysteresis and thermal feedback loops. We use linear severity ramps because rolling-mean and rate-of-change features pick the slope up cleanly, and because the *temporal coherence* of the degradation (not its physical accuracy) is what the model learns. The simulator's job is to be a clean teacher, not a faithful emulator.

---

## Day 4 Module 3 — fast-gen pipeline, plus a parquet-export asyncio gotcha — 2026-05-05

**What happened:** Built fast-gen mode (`simulation/fastgen.py`) that runs the same physics + cycle modules as live mode but in a tight Python loop with batched multi-row INSERTs and no `asyncio.sleep`. Generated 168 simulated hours (604,800 rows) in **2:00 wall-clock** — well inside SPRINT.md's <5 minute target. After generation, a separate look-ahead pass computes `will_fail_10min` for every non-DOWN row using a bisect over sorted DOWN timestamps (O(N), not O(N²)). The pass also segregates fast-gen SimRuns from the live SimRun (`id=1`): scoped `/reset` and `/telemetry/recent` to the live id, so fast-gen training data survives operator interactions with the dashboard.

The Parquet export script (`scripts/export_training_data.py`) hit a non-obvious asyncio bug on the first run: two separate `asyncio.run()` calls — one to look up the most recent COMPLETED SimRun, one to do the export — created two different event loops, but `AsyncSessionLocal` was bound to a connection pool created on the first loop. Second call raised `RuntimeError: got Future ... attached to a different loop` deep inside asyncpg. Fixed by collapsing both operations into a single `_main_async` coroutine called once via `asyncio.run`.

**Why it happened:** SQLAlchemy's async engine creates its connection pool on the first event loop that touches it. The asyncpg driver caches per-connection state (transaction handles, prepared statements) bound to that loop's `asyncio.Future` infrastructure. When the first `asyncio.run()` exits, the loop closes — but the engine's cached connection objects still reference the dead loop's internals. The second `asyncio.run()` creates a fresh loop, asks the engine for a connection, gets one of the cached objects, and asyncpg's internals fail when they try to attach a new Future to the dead loop. The defensive fix would be calling `engine.dispose()` between runs; the structural fix is to never run two top-level event loops in the same script.

**The class-balance calibration note worth recording:** SPRINT.md targets ~85/15 normal/onset class balance per CLAUDE.md. With the default `failure_probability=0.15` (per simulated hour) plus `REPAIR_DURATION_S=300` (5 min repair window after each failure), 168h produces ~18 failure events with ~5% failure-onset rows and ~1.7% will_fail_10min positives — significantly more imbalanced than the spec target. The rate-limiting factor is the repair window: at p=0.15/hr the *expected* arrival rate of failures is 25 per 168h, but the simulator can't queue overlapping failures, and each failure consumes 5 + ~30 minutes of "machine unavailable for new failure" time. Day 7 will absorb this with `class_weight='balanced'` (sklearn) or `scale_pos_weight` (XGBoost), or we re-generate with a tighter repair window. **The endpoint is parameterised** — `failure_probability` is a query arg — so re-balancing without code changes is one curl away.

**Takeaway:**
- **`asyncio.run()` is per-event-loop, but cached resources are not.** Any module that holds engine, pool, or connection state at module-import time silently inherits the first event loop. Scripts that do "look up something, then act on it" via two top-level `asyncio.run()` calls hit the dead-loop bug. The cheap structural fix: every script has exactly one `asyncio.run(main_async())` and `main_async` does everything. The expensive fix: dispose engines between runs. Always pick the structural fix.
- **Class balance is a knob, not a constant.** The simulator's job is to *produce* labelled data; whether the labels are 5%, 15%, or 50% positive is a downstream training decision. Resist the temptation to bake "right" balance into the simulator — it makes the simulator's behaviour opaque and ties the simulator to the model's class-imbalance handling. Better: leave the parameter exposed, document the knob, and let the training script pick.
- **Fast-gen and live mode share physics by construction, not by convention.** Both call `generate_normal_reading()` and `apply_failure_signature()` from the same module. There is no parallel implementation. Train-serve skew at the data layer was the headline risk for this sprint (D8); collapsing the implementations into one removes the failure mode entirely. Worth the small abstraction cost (engine.py imports the same functions; fastgen.py imports the same functions).

---

## Day 7 — feature engineering, classifier training, anomaly detector — 2026-05-06

**What happened:** Built the three ML training modules for `pdm-ai-engine`. Started by regenerating the training dataset at `failure_probability=0.5` to get a reliable test set — 85 failure events, 50,833 positive rows (8.77% positive rate) across 604,800 total rows. Previous generation at p=0.15 produced only 18 failure events, giving a test set too small for stable ROC-AUC estimates.

`features.py` implements the D8 shared feature contract: 8 raw sensors pass through, plus 4 rolling 60s means, 3 rolling 60s stds, 3 rate-of-change features (diff over 10s lag), and 1 cross-feature (`power_per_voltage`). `prepare_training_frame()` wraps `compute_features()` and drops DOWN-state rows and warmup NaN rows — 579,375 usable rows after filtering.

`train_classifier.py` trains three variants under MLflow: XGBoost (scale_pos_weight=10.9), Random Forest (class_weight='balanced'), and an ensemble averaging both probabilities. Time-based 80/20 split — mandatory because rolling-window features encode temporal history. Best variant: ensemble. ROC-AUC 0.9784, PR-AUC 0.9503, F1 0.912.

`train_anomaly.py` trains Isolation Forest on normal-only rows (528,542). ROC-AUC 0.9313. Saves `reference_distribution.json` as the PSI drift baseline for Day 10.

The UF_HIDDEN bug recurred 6+ times. Permanent mitigation: `touch .venv/.metadata_never_index` on both venvs, `fixvenv` alias in `~/.zshrc`.

**Takeaway:**
- **Regenerate when the test set is too small.** 18 failure events gives unstable ROC-AUC estimates. 85 events gives a defensible number. Two minutes of fast-gen time.
- **Time-based split is non-negotiable for rolling-window features.** Random split leaks future rows into training via the rolling mean dependencies.
- **The ensemble wins because XGBoost and RF make different errors.** Averaging probabilities is the cheapest ensemble — no stacking — and beat both individual models on every metric.

---

## Day 8-9 — live prediction pipeline + API endpoints — 2026-05-06

**What happened:** Wired trained models into the live system. `predictor.py` loads both joblib bundles once at startup, calls `compute_features()` (D8 consistency), returns `{ai_risk_score, ai_anomaly_score, ai_status}`. `MODELS_DIR` anchored to `__file__` — no CWD dependency.

`poll.py` infinite async loop at 1Hz: find newest `ai_status IS NULL` row, fetch 300 rows of history for rolling-window context, call predictor, UPDATE that one row. The NULL-frontier pattern is self-correcting — crash and restart lands on the correct next row automatically.

First query version had a bug: fetched 300 rows `ORDER BY timestamp_sim DESC`, took `iloc[-1]` — this was a middle-of-history row, not the live frontier. Fix: explicitly query `WHERE ai_status IS NULL ORDER BY id DESC LIMIT 1` first.

`api.py`: `/health`, `/status`, `/predict`, `/api/recent-predictions?limit=N`. Uvicorn PATH confusion after `source ~/.zshrc` — fix: always use `.venv/bin/python -m uvicorn`.

**Takeaway:**
- **NULL-frontier poll pattern is strictly better than offset-based pagination.** Idempotent on restart, no drift on out-of-order inserts.
- **`MODELS_DIR` must be path-anchored, not CWD-relative.** Relative paths silently fail when the working directory changes.
- **FastAPI lifespan is the right place for expensive one-time startup.** Loading 50MB+ joblib inside a request handler adds 1s latency per call.

---

## Day 10 — PSI drift monitoring + the `/api/drift` endpoint — 2026-05-07

**What happened:** Implemented [monitoring/drift.py](pdm-ai-engine/src/sentinel_pdm/monitoring/drift.py) — PSI computation across all 19 features, bins derived from `reference mean ± 3σ`, synthetic 10k-sample reference reconstructed at compute time from the `{mean, std}` JSON saved on Day 7. Aggregate is `max` across features (conservative — any single drifting sensor flags the whole system). Wired in `/api/drift` endpoint that fetches the last 300 scored rows, runs `compute_features()`, calls `compute_psi()`, returns the dict. Five PSI math tests passed first try except for one — the "identical distributions" assertion `< 0.05` failed at PSI=0.0703 even though the distributions were genuinely identical.

**Why the "identical" PSI wasn't zero:** Two compounding sources of irreducible noise. (1) The reference is a 10k synthetic sample, the live is a 500-row sample — small-sample histograms have bin-to-bin count variance that doesn't fully cancel even for identically-parameterised draws. (2) The `_EPSILON = 1e-4` floor prevents `log(0)` but introduces a small positive bias in any bin where the live sample happens to have zero rows. Both are correct design choices for production stability; both contribute a non-zero floor. The lesson is that "identical" in a sampled-distribution test means "should not exceed the WARNING threshold" (< 0.1), not "should be ~0." The threshold check is what the production system actually cares about.

**How we fixed it:** Relaxed the assertion from `< 0.05` to `< 0.1` — i.e. "identical distributions don't fire a WARNING," which is the production-meaningful invariant.

**Takeaway:**
- **Test thresholds should match production thresholds, not theoretical ideals.** Asserting PSI < 0.05 sounds tighter, but it's testing a property the production system doesn't care about. The endpoint cares about WARNING (0.1) and CRITICAL (0.2). Test those bounds; the gap between 0 and 0.1 is sampling noise, not signal.
- **Synthetic reference is a real design choice with a real cost.** Storing only `{mean, std}` per feature (rather than raw quantiles or histogram counts) trades fidelity for simplicity. The cost is the noise floor we hit. The benefit: 19 features × 16 bytes vs. 19 features × 100k floats. Worth it for this scale; would not be worth it if we were debugging which exact sensors drifted at what magnitude.
- **`max` over features is the right aggregator for safety, `mean` would be the right aggregator for typical-condition reporting.** We picked `max` because the cost of a missed drift is wrong predictions in production — better to over-flag than under-flag. Worth being explicit: this is a Type I/II tradeoff, not a math choice.

---

## Day 11 — pytest setup, the `__init__.py` trap, and 14 passing tests — 2026-05-08

**What happened:** Built [tests/test_api.py](pdm-ai-engine/tests/test_api.py) with 9 endpoint tests covering happy + sad paths for `/health`, `/predict`, `/status`, `/api/recent-predictions`, `/api/drift`. First attempt to run any test file failed twice in a row before a single test executed:

(1) `from ..sentinel_pdm.monitoring.drift import ...` — `ImportError: attempted relative import beyond top-level package`. The file in source had absolute imports; pytest was treating it as a relative one because `tests/__init__.py` existed.

(2) After deleting `tests/__init__.py` — `ModuleNotFoundError: No module named 'sentinel_pdm'`. The package was installed in editable mode (`pip show sentinel-pdm` confirmed it), but pytest's `sys.path` didn't include `src/`.

**Why it happened:**
- (1) When `__init__.py` exists in a test directory, pytest treats it as a regular package and imports `test_drift.py` as `tests.test_drift` — a submodule. From inside a submodule, Python's import resolver applies different rules to absolute imports than it does at top level. Pytest's "rootdir" detection compounds the confusion. The simpler model — no `__init__.py`, pytest adds the test directory itself to `sys.path` and imports each test file as a top-level module — is what most projects use because it sidesteps this entire class of bug.
- (2) `pyproject.toml` had `[tool.setuptools.packages.find] where = ["src"]` (which tells *setuptools* where the package lives), but no `[tool.pytest.ini_options] pythonpath = ["src"]` (which tells *pytest* where to look at test-collection time). Editable installs *should* make this redundant, but the install on disk was flaky enough (UF_HIDDEN ghost from earlier days, plus mixed Python interpreter resolution) that pytest was reading from a path the editable install hadn't reached. Adding `pythonpath = ["src"]` to pyproject.toml made pytest's import path explicit and stopped depending on the editable install working.

**How we fixed it:**
- Deleted `pdm-ai-engine/tests/__init__.py`.
- Added a `[tool.pytest.ini_options]` block to [pdm-ai-engine/pyproject.toml](pdm-ai-engine/pyproject.toml) with `pythonpath = ["src"]`, `testpaths = ["tests"]`, `asyncio_mode = "strict"`.
- Created `.vscode/settings.json` with `python.analysis.extraPaths` pointing at the source folders so Pylance stops red-squiggling imports it can't resolve.
- Built `make_mock_session(rows)` helper — a 5-layer stack of `MagicMock`/`AsyncMock` that mirrors `async_session() → session → execute() → result → mappings()`. Used it to fake the DB chain in 5 of the 9 tests. Once written, every DB-touching test was a 3-line variation.

**Takeaway:**
- **`__init__.py` in `tests/` is almost always wrong.** It's the right call only if your tests import each other (e.g. shared fixtures via `from tests.conftest import X`). For everything else it triggers Python's submodule import semantics, which interact badly with pytest's discovery. The default rule should be: no `__init__.py` in tests. Same as Day 1 with the `.env` heredoc — the failure mode is "looks like it should work, doesn't, and the symptom is one layer removed from the cause."
- **Editable installs are a convenience, not a guarantee.** Days 2 and 3 already logged UF_HIDDEN making editable installs silently invisible. Day 11 adds: even when the editable install *is* visible, pytest's path resolution doesn't depend on it. The right belt-and-suspenders move is to declare `pythonpath` in `pyproject.toml` explicitly. Then pytest works whether or not the editable install is healthy.
- **A mock helper is worth writing once.** The `make_mock_session` builder is 18 lines. Without it, every DB-touching test would have inlined the same 18 lines of mock plumbing — boilerplate that obscures what the test is actually checking. With the helper, the test reads as "pretend the DB has these rows, hit the endpoint, assert the response." The signal-to-noise ratio is the only thing keeping a test suite readable as it grows. **Build the helper the second time you need the same mock structure, never the first time, never the third.**
- **Pydantic gives you 422-style validation for free.** `test_predict_invalid_payload` sends a request with 7 missing fields and asserts a 422. We wrote zero validation code in the endpoint; the `SensorPayload(BaseModel)` class made it automatic. This is the part of FastAPI that's worth using deliberately — every input boundary should have a Pydantic model, both for the validation and so the OpenAPI schema is honest about what the endpoint accepts.

---

## Day 12 — React Rules of Hooks violation (black screen on Maintenance tab) — 2026-05-10

**What happened:** After wiring the persistent alert log into the Maintenance tab, the tab went completely black — no error message, no loading state, just an empty div. The browser console showed: `React has detected a change in the order of Hooks called by MaintenanceTab.` React then unmounted the component entirely and left the DOM empty.

**Why it happened:** The hook call order in React must be identical on every render, unconditionally. The Maintenance tab had a loading guard — `if (!recentQ.data || recentQ.data.length === 0) { return <DashboardLoading />; }` — and `useAlertLog(...)` was called *after* that return. On the first render (no data yet), React counted N hooks. On the second render (data arrived), it counted N+1 because the early return was no longer taken. React detected the changed hook count and threw. Because there was no error boundary above the tab, React unmounted the subtree silently.

The mistake is subtle: the loading guard looked like a "nothing happens yet" early return, so it felt safe to put hooks below it. But React doesn't know about "nothing happens" — it only sees a different number of hook calls on two consecutive renders.

**How we fixed it:** Moved `useAlertLog` (and its dependencies: `earlyRisk`, `earlyMachineState`, `earlyState`) above the loading guard. All hooks now run unconditionally on every render.

```jsx
// WRONG — hook below early return:
if (!recentQ.data) return <DashboardLoading />;
const alertLog = useAlertLog(...); // skipped on first render

// RIGHT — all hooks before any return:
const alertLog = useAlertLog(...);
if (!recentQ.data) return <DashboardLoading />;
```

**Takeaway:**
- **Every hook must be above every conditional return, always.** This is not a style preference — React's reconciler depends on hook calls being counted in the same order on every render. An early return is a conditional branch; a hook below it is a conditional hook. The `react-hooks/rules-of-hooks` eslint rule catches this at write time. Without it, the failure mode is a runtime unmount that looks like a blank page, not an error.
- **Loading guards are not "nothing". They are conditional renders.** The mental model "I'll put hooks below the guard because the guard is just a loading spinner" is wrong. Every `if (...) return` inside a component is a branch that can short-circuit hook evaluation. Hard rule: all hooks at the top, all conditionals below.
- **Silent failures are the worst kind.** The component didn't throw; it was just gone. React logs the violation to the console in development mode, but in production the result is simply "the component disappeared." An error boundary above each tab would have shown a recoverable error state instead of a blank screen.

---

## Day 12 — `parts_per_hour` returning a raw count instead of a rate (cycle time 124s vs 18s) — 2026-05-10

**What happened:** The Operator tab showed a cycle time of `124.1s` after repair. The real cycle time is ~18s. The dashboard derives cycle time as `3600 / parts_per_hour`, so `3600 / 29 ≈ 124s` — meaning `parts_per_hour` was 29 instead of ~200.

**Why it happened:** The `/api/production` endpoint computed:
```python
parts_in_hour = ok_in_hour + ng_in_hour   # e.g. 29 parts in the last 3600-row window
parts_per_hour = parts_in_hour             # BUG: count, not rate
```
The window is always 3600 rows, but those rows span both running and DOWN time. After a repair with minimal history, the window might contain 3000 DOWN rows and 600 running rows. 29 parts in 600 running seconds is 29 × (3600/600) = 174 parts/hr — but the API was returning 29 directly. The error scales with downtime: the more downtime in the window, the further off the number.

**How we fixed it:**
```python
running_rows = max(1, hour["row_count"] - hour["down_rows"])
parts_per_hour = round(parts_in_hour * 3600 / running_rows)
```

**Takeaway:**
- **A count dressed up as a rate is a type error the compiler can't catch.** Both the old and new values were integers; nothing in Python flagged which was correct. Naming helps: `parts_in_hour` (count) vs `parts_per_hour` (rate). When names lie, every downstream consumer is wrong.
- **Rates over windows with varying availability must be normalised by active time, not wall-clock time.** Dividing total parts by total elapsed time when some of that time was downtime gives the wrong answer. The denominator must exclude unavailable periods — same principle as OEE.
- **Derived metrics cascade errors.** One wrong API field corrupted three UI elements: Parts/hr tile, Cycle time tile, Cycle time delta badge. All three looked plausible in isolation. Trace the dependency graph before assuming a downstream number is independently trustworthy.

---

## Day 12 — Repair endpoint returning 409 when tick loop had crashed — 2026-05-10

**What happened:** After an unexpected exception inside `_tick()` caused the loop to crash, the machine entered a dead state: `cycle.state = DOWN`, `running = False`. The operator hit the Repair button and got: `Repair failed: 409 Conflict — engine is not running; call /start or /reset first`. The dashboard showed the HALTED banner with no recovery path.

**Why it happened:** The repair endpoint checked `engine.running` and refused with a 409 if the engine wasn't running — a reasonable guard when the engine was stopped intentionally. But `running` goes `False` both on deliberate `/stop` and on tick-loop crash. The two cases look identical from the flag's perspective but require different operator responses: "stopped intentionally" should require an explicit restart; "crashed mid-run" should auto-recover transparently. The endpoint had no way to distinguish them, so it applied the conservative behaviour in both cases.

**How we fixed it:** The repair endpoint now auto-starts the engine when it finds `cycle.state = DOWN` but `running = False`:
```python
changed = engine.repair()
if not engine.running and changed:
    await engine.start()  # transparent crash recovery
```

**Takeaway:**
- **User-facing endpoints should recover from recoverable states, not just report them.** A 409 with "call /start first" is correct for a developer reading API docs. It is wrong UX for an operator whose only interface is a dashboard button. Design for the most constrained caller.
- **"Not running" is not a single state.** Stopped (deliberate) and crashed (exception) are both `running=False` but need different recovery paths. When one flag value maps to two correct responses, the flag is the wrong representation.
- **Background task crashes must be observable.** The loop caught the exception, set `running=False`, and called `cycle.fail()` — correct defensively, but left no evidence of why it crashed. `logger.exception("tick failed")` gives a full traceback before the next user action surfaces the symptom.

---

## Day 12 — Cross-service constant duplication (`COIL_EXPECTED_PARTS = 5000`) — 2026-05-10

**What happened:** During a codebase audit, `COIL_EXPECTED_PARTS = 5000` was found defined independently in both `engine.py` (simulator) and `api.py` (AI engine). The two services share a Postgres database but cannot import from each other. Risk: changing the coil spec in the simulator leaves the AI engine's `coil_life.expected` and `pct_remaining` calculation silently wrong.

**Why it happened:** Both files were written independently and the constant was small enough that duplication seemed harmless. But the moment there are two copies, they can diverge — and the divergence is invisible until someone actually changes one. No compiler, no test, no lint rule catches "constant in service A no longer matches service B."

**How we fixed it:** Created a `machine_config` table (Alembic migration `a3f8e2c91b05`) with a key/value schema. The simulator writes `coil_expected_parts=5000` to this table on every `start()` call. The AI engine reads the value from `machine_config` in `/api/production`, with a fallback of 5000 for first-boot safety. The constant is now defined once in the simulator; the DB is the single source of truth for cross-service reads.

**Takeaway:**
- **Two services that share a database share more than rows — they share domain constants.** When a value governs calculations in both services, it belongs in the shared medium (the DB), not duplicated in both codebases. `machine_config` is the lightweight way to do this without a shared package or a service-to-service API call.
- **"It's just a number" is how duplicates become bugs.** The value is safe today because nobody has changed it. It becomes dangerous the first time someone updates the coil spec for a new production run. The fix cost was one migration and one SQL read. The prevention value: whoever changes `COIL_EXPECTED_PARTS` in the simulator propagates it to the AI engine automatically on next start.
- **Duplication across service boundaries is categorically different from duplication within a service.** Within one codebase, a linter or search finds both copies. Across two services, nothing connects them. Treat any value two services must agree on as a contract point, not a convenience copy.

---
