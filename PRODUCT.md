# PRODUCT.md — Paperclip Fork (ghostwater-ai/paperclip)

## What It Is

Our fork of [Paperclip](https://github.com/paperclipai/paperclip), the open-source orchestration layer for autonomous AI agent teams. Paperclip gives a team of AI agents an org chart, task board, budgets, heartbeat-driven execution, and a dashboard UI — like a project manager for bots.

**Target user:** Teams running multiple AI agents (via OpenClaw, Claude Code, Codex, etc.) that need coordination, task assignment, and visibility across agents.

**Core value proposition:** Single control plane for a multi-agent company — assign goals, delegate tasks, track costs, enforce governance, and let agents self-organize via heartbeat wakes.

## Fork Rationale

Upstream Paperclip is actively developed by one primary maintainer (cryppadotta, 740+ commits). We forked to ship features we need now without waiting for upstream merge cycles. Branch model:

- **`main`** — mirrors upstream `master` (fast-forward only, never commit directly)
- **`patches`** — upstream + our custom commits on top (23 commits ahead of main as of March 2026)

Strategy: build on our fork as primary, cherry-pick from upstream as needed, contribute back via PRs where applicable.

## Current State

### What Works Today

**Upstream features (inherited):**
- Task board UI with drag-and-drop, priorities, labels, goals, parent-child task hierarchy
- Multi-adapter agent system: OpenClaw Gateway, Claude Code, Codex, Cursor, Bash, HTTP
- Heartbeat-driven agent wakes: configurable intervals, status-change triggers, comment triggers
- Org chart with reporting relationships and chain of command
- Budget and cost tracking per agent
- Approval workflows and governance gates
- Document management (planning docs, specs)
- Plugin system with SDK (jobs, webhooks, entities)
- BetterAuth authentication with embedded Postgres
- CLI for agent management, project operations, and configuration

**Our patches (23 commits on `patches` branch):**

1. **OpenClaw Gateway adapter enablement** — Adapter was present upstream but not wired into UI selection. We enabled it, fixed the missing message field, and added static agentId handling. (PR #1)

2. **Agent CLI subcommands** — `agent create`, `agent update`, `agent delete` with full adapterConfig support. Upstream only had API endpoints. (PR #5)

3. **Session key routing engine** — Rule-based routing with template variables for session key resolution. Routes agent wakes to the correct OpenClaw session based on event type and project context. Pattern matching with `{{project.metadata.sessionKey}}` interpolation. (PRs #7, #9)

4. **Project metadata JSONB** — Added `metadata` column to projects table (migration 0038). Enables dot-path template variables in routing rules so each project can specify its own Slack channel for agent notifications. (PR #16)

5. **Per-agent API key path** — `apiKeyPath` field in adapter config so each OpenClaw agent reads its claimed API key from its own workspace directory instead of a hardcoded shared path. Critical for multi-agent setups where agents have separate workspaces. (PR #22, upstream issue #930)

6. **PATCH endpoint shallow-merge fix** — `PATCH /api/agents/:id` was replacing `adapterConfig` and `runtimeConfig` entirely instead of merging. Wiped 3 agents' configs before we caught it. Now shallow-merges with existing config. Includes 422 guard for non-object runtimeConfig. (PR #24, upstream PR #984 open)

7. **Scheduled tasks** — Template tasks with cron expressions or one-shot ISO-8601 timestamps. Scheduler runs alongside heartbeat tick loop (~30s). Fires → clones template into fresh task instance → enqueues wake for assigned agent. Auto-disables one-shots after firing. Cron recomputes next run. Migration 0039 adds 5 columns to issues table + partial index. (PR #26, issue #25)

8. **Scheduled task identifier fix** — Cloned instances were missing `issueNumber`/`identifier`. Fixed by incrementing company issue counter during clone. (Issue #27)

### What's Broken or Incomplete

- **Upstream PR #984 pending** — Our PATCH shallow-merge fix awaits upstream review. No response from maintainer yet.
- **Wake feedback loop** — Completing a task and posting a comment triggers a second wake for the same agent on an already-done task. Adapter should skip wakes for self-authored comments or done issues.
- **Customizable wake templates** — Wake text (`buildWakeText()`) is still hardcoded. Issue #20 proposes cascading templates per agent/project/event type. May be superseded by scheduled tasks for some use cases.
- **Upstream UI convergence** — Our routing editor and metadata UI don't follow upstream's latest component patterns. Issue #14.
- **Onboarding text gaps** — Invite/onboarding instructions don't mention `sessionKeyRouting` config. Issue #11.
- **Test coverage** — 481 tests pass / 17 fail (pre-existing upstream failures in workspace-runtime, agents-patch-config-merge, and db client).

### Last Meaningful Activity

- March 19, 2026: Scheduled tasks shipped (PR #26 merged), identifier fix (PR #27), Oz API key provisioned, end-to-end test passed
- March 18, 2026: Upstream sync completed — main fast-forwarded to upstream master (1ac85d8), patches rebased clean with conflict resolution across 6 files

## Architecture

### Key Components

```
┌─────────────────────────────────────────────────┐
│                  Paperclip UI                    │
│         React + Vite + Tailwind + shadcn         │
│   (Task board, Org chart, Budget, Settings)      │
└───────────────────────┬─────────────────────────┘
                        │ HTTP
┌───────────────────────▼─────────────────────────┐
│               Paperclip Server                   │
│            Express + Drizzle ORM                 │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────┐  │
│  │ Issues   │ │ Agents   │ │ Heartbeat       │  │
│  │ Service  │ │ Service  │ │ Timer + Wakes   │  │
│  └──────────┘ └──────────┘ └─────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────┐  │
│  │ Routing  │ │ Scheduled│ │ Plugin System   │  │
│  │ Engine   │ │ Tasks    │ │ (SDK + Jobs)    │  │
│  └──────────┘ └──────────┘ └─────────────────┘  │
└───────────────────────┬─────────────────────────┘
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
    ┌────────────┐ ┌─────────┐ ┌──────────┐
    │ OpenClaw   │ │ Claude  │ │ Codex    │
    │ Gateway    │ │ Local   │ │ Local    │
    │ Adapter    │ │ Adapter │ │ Adapter  │
    └────────────┘ └─────────┘ └──────────┘
           │
           ▼
    ┌────────────────────────┐
    │ OpenClaw Gateway       │
    │ (WebSocket wake)       │
    │ → Agent sessions       │
    │ → Slack/Telegram/etc   │
    └────────────────────────┘
```

### Tech Stack

- **Server:** Node.js, Express, TypeScript, Drizzle ORM
- **Database:** PostgreSQL (embedded-postgres for local dev, standard Postgres for production)
- **UI:** React, Vite, Tailwind CSS, shadcn/ui, TanStack Query
- **Auth:** BetterAuth (cookie-based, `__Secure-better-auth.session_token`)
- **Adapters:** Pluggable per agent — OpenClaw Gateway (WebSocket), Claude/Codex/Cursor (local process), Bash (shell), HTTP (webhook)
- **Packages:** Monorepo with `pnpm` workspaces — `server`, `ui`, `cli`, `packages/db`, `packages/shared`, `packages/adapters/*`, `packages/plugins/*`

### Deployment

- **Host:** ore-01 (local server), running as a Node.js process on port 3100
- **Database:** Local PostgreSQL, `paperclip` database
- **No container:** Runs directly from repo checkout on `patches` branch (`pnpm build` → `node server/dist/index.js`)
- **Service management:** Was systemd (`paperclip.service`), currently running as a direct process

### External Dependencies

- **OpenClaw Gateway** (localhost:18789) — WebSocket connection for agent wakes. OpenClaw adapter sends wake payloads containing task context, API key path, and session routing rules.
- **Upstream remote** (`paperclipai/paperclip`) — Tracked for cherry-picking. Fetched periodically for sync.

## Gap Analysis

### High Impact

1. **Wake template customization (Issue #20)** — `buildWakeText()` is hardcoded. Different agents, projects, and event types need different wake instructions. Cascading template resolution designed but not yet built. Partially mitigated by scheduled tasks for recurring work.

2. **Self-wake suppression** — Agent completing a task triggers a redundant wake for itself. Needs adapter-level filtering for self-authored comments and already-done issues.

3. **Upstream sync cadence** — 23 commits diverged. Rebase tax is increasing (last sync required resolving conflicts across 6 files including migration renumbering). Need a sustainable sync strategy — possibly shift to cherry-picking specific upstream features rather than full rebases.

### Medium Impact

4. **UI pattern convergence (Issue #14)** — Our routing editor and metadata UI predate upstream's latest component conventions. Will cause merge conflicts and visual inconsistency.

5. **Heartbeat configuration** — Agent heartbeats are currently disabled for all agents (`heartbeat.enabled: false`). Scheduled tasks handle recurring work, but reactive heartbeats (checking for new tasks, status changes) aren't running. Need to determine optimal heartbeat interval vs scheduled task coverage.

6. **Onboarding flow gaps (Issue #11)** — Invite text doesn't document `sessionKeyRouting`, making it harder for new agents to self-configure.

### Low Impact / Technical Debt

7. **Test baseline** — 17 pre-existing test failures. Should triage and fix or skip to establish a clean baseline for CI.

8. **Migration numbering fragility** — Our migrations are 0038 and 0039. Each upstream sync risks renumbering collisions if upstream adds migrations. Consider switching to timestamp-based naming.

9. **Open fork issues** — Issues #4 (UI test coverage), #12 (routing editor help modal), #19 (upstream PR plan) are stale. Triage and close or schedule.

## Next Actions

1. **File issue for self-wake suppression** — Define the filtering rules (skip wakes for self-authored comments, skip wakes for done issues) and implement in the OpenClaw adapter's wake pipeline.

2. **Follow up on upstream PR #984** — Tag cryppadotta again or find alternate review path. The PATCH shallow-merge fix is correct and upstream has the bug.

3. **Triage stale fork issues** — Close #4, #12, #19 if no longer relevant or reprioritize.

4. **Evaluate heartbeat vs scheduled tasks** — Determine which agent workflows are better served by reactive heartbeats vs cron-scheduled template tasks. Document the decision.

5. **Plan next upstream sync** — Track upstream PRs #1206 (multi-agent session key routing), #1223 (agent-home workspace alignment), #1232 (broader status-change wakes) for cherry-picking when merged.
