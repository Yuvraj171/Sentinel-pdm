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
