# PRODUCT.md — Paperclip Fork (ghostwater-ai/paperclip)

## Layer 1: What Is This Thing?

**One sentence:** Our fork of [Paperclip](https://github.com/paperclipai/paperclip) — the open-source orchestration layer that gives autonomous AI agent teams an org chart, task board, budgets, heartbeat-driven execution, and a dashboard UI.

**Who uses it:** Teams running multiple AI agents (via OpenClaw, Claude Code, Codex, etc.) that need coordination, task assignment, and visibility across agents.

**Why they care:** Single control plane for a multi-agent company — assign goals, delegate tasks, track costs, enforce governance, and let agents self-organize via heartbeat wakes.

**How they find it / how they pay:** Internal tool. Fork of upstream open-source project.

### Tech Stack

- **Server:** Node.js, Express, TypeScript, Drizzle ORM
- **Database:** PostgreSQL (embedded-postgres for local dev, standard Postgres for production)
- **UI:** React, Vite, Tailwind CSS, shadcn/ui, TanStack Query
- **Auth:** BetterAuth (cookie-based, `__Secure-better-auth.session_token`)
- **Adapters:** Pluggable per agent — OpenClaw Gateway (WebSocket), Claude/Codex/Cursor (local process), Bash (shell), HTTP (webhook)
- **Packages:** Monorepo with `pnpm` workspaces — `server`, `ui`, `cli`, `packages/db`, `packages/shared`, `packages/adapters/*`, `packages/plugins/*`

### Repo Location

- **Origin:** `https://github.com/ghostwater-ai/paperclip.git`
- **Upstream:** `https://github.com/paperclipai/paperclip.git`
- **Local:** `~/projects/paperclip`
- **Primary branch:** `patches` (upstream + our custom commits)
- **Deployed on:** ore-01, port 3100, running directly from repo checkout

---

## Layer 2: What Matters Right Now?

### Current Focus (Q1 2026)

Ship the fork patches that make Paperclip usable as the control plane for our multi-agent team. Prioritize features that unblock agent autonomy (routing, scheduling, per-agent config).

### What "Done" Looks Like

- Agents receive correctly routed wakes based on project + event type
- Scheduled tasks fire reliably on cron/one-shot schedules
- Each agent reads its own API key from its own workspace
- PATCH endpoints don't wipe agent configs

### Known Constraints

- Single upstream maintainer (cryppadotta) — slow merge cycles, so we ship on our fork first
- 23 commits diverged from upstream; rebase tax increases with each sync
- No CI pipeline on the fork yet

### What We're NOT Doing

- Building a hosted/SaaS version
- Full test suite remediation (17 pre-existing upstream failures are accepted debt)
- Major UI redesign — follow upstream patterns where possible

### Fork-Specific Patches (23 commits on `patches`)

1. **OpenClaw Gateway adapter enablement** — Adapter was present upstream but not wired into UI. Enabled it, fixed missing message field, added static agentId handling. (PR #1)
2. **Agent CLI subcommands** — `agent create`, `agent update`, `agent delete` with full adapterConfig support. (PR #5)
3. **Session key routing engine** — Rule-based routing with template variables for session key resolution. Pattern matching with `{{project.metadata.sessionKey}}` interpolation. (PRs #7, #9)
4. **Project metadata JSONB** — `metadata` column on projects table (migration 0038). Enables per-project Slack channel routing. (PR #16)
5. **Per-agent API key path** — `apiKeyPath` in adapter config for multi-workspace agent setups. (PR #22, upstream issue #930)
6. **PATCH endpoint shallow-merge fix** — Shallow-merges `adapterConfig`/`runtimeConfig` instead of replacing. 422 guard for non-object runtimeConfig. (PR #24, upstream PR #984 open)
7. **Scheduled tasks** — Template tasks with cron or one-shot ISO-8601 timestamps. Scheduler runs alongside heartbeat tick loop (~30s). Migration 0039. (PR #26, issue #25)
8. **Scheduled task identifier fix** — Cloned instances get proper `issueNumber`/`identifier`. (Issue #27)

---

## Layer 3: User Acceptance Criteria

### UAC-001: Agent receives routed wake via OpenClaw Gateway
- status: implemented
- added: 2026-03-01 (PRs #1, #7, #9)
- source_files: packages/adapters/openclaw-gateway/
- criteria:
  - Agent wake payload includes task context, API key path, and session routing
  - Wake is routed to correct OpenClaw session based on project metadata and event type
  - Session key resolves template variables (e.g. `{{project.metadata.sessionKey}}`)

### UAC-002: Agent CLI supports full CRUD
- status: implemented
- added: 2026-03-01 (PR #5)
- source_files: cli/
- criteria:
  - User can `agent create` with adapter type and full adapterConfig
  - User can `agent update` to modify config without wiping unrelated fields
  - User can `agent delete` to remove an agent

### UAC-003: PATCH endpoint preserves existing config
- status: implemented
- added: 2026-03-15 (PR #24)
- source_files: server/src/routes/agents.ts
- criteria:
  - `PATCH /api/agents/:id` shallow-merges `adapterConfig` and `runtimeConfig` with existing values
  - Sending a partial adapterConfig update does not wipe other adapterConfig fields
  - Non-object `runtimeConfig` returns 422

### UAC-004: Scheduled tasks fire on cron schedule
- status: implemented
- added: 2026-03-19 (PR #26)
- source_files: server/src/services/scheduler.ts, packages/db/migrations/0039*
- criteria:
  - User can create a template task with a cron expression
  - Scheduler clones template into fresh task instance at each cron tick
  - Cloned task enqueues wake for assigned agent
  - One-shot tasks auto-disable after firing
  - Cloned instances have correct `issueNumber`/`identifier`

### UAC-005: Per-agent API key isolation
- status: implemented
- added: 2026-03-19 (PR #22)
- source_files: packages/adapters/openclaw-gateway/
- criteria:
  - Each agent's adapterConfig can specify an `apiKeyPath`
  - Agent reads its API key from its own workspace directory
  - Multiple agents on the same host don't share a single key file

### UAC-006: Self-wake suppression
- status: intent
- added: 2026-03-23 (gap analysis)
- source_files: packages/adapters/openclaw-gateway/
- criteria:
  - Completing a task does not trigger a redundant wake for the completing agent
  - Self-authored comments do not trigger wakes for the comment author
  - Wakes for already-done issues are skipped

### UAC-007: Wake template customization
- status: intent
- added: 2026-03-23 (Issue #20)
- source_files: server/src/services/wake.ts
- criteria:
  - Wake text is configurable per agent, project, and event type
  - Cascading template resolution (agent-specific → project-specific → default)
  - Templates support variable interpolation

---

## Layer 4: Engineering Invariants

1. **Config merge, never replace** — All PATCH endpoints that accept nested objects (`adapterConfig`, `runtimeConfig`, `metadata`) must shallow-merge with existing values. (Enforces UAC-003)

2. **Template variable resolution** — Session key routing must resolve all `{{...}}` template variables before dispatching a wake. Unresolved variables must fail loudly, not send to a malformed session. (Enforces UAC-001)

3. **Fork branch discipline** — `main` mirrors upstream `master` (fast-forward only, never commit directly). All custom work goes on `patches`. (Structural)

4. **Migration numbering** — Fork migrations start at 0038+. Watch for collisions on upstream sync. (Structural)

5. **Scheduled task cloning** — Cloned task instances must always receive a valid `issueNumber` and `identifier` by incrementing the company issue counter. (Enforces UAC-004)

---

## Appendix: Architecture Reference

### Component Diagram

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

### External Dependencies

- **OpenClaw Gateway** (localhost:18789) — WebSocket connection for agent wakes
- **Upstream remote** (`paperclipai/paperclip`) — Tracked for cherry-picking and periodic sync

### Deployment

- **Host:** ore-01, running as Node.js process on port 3100
- **Database:** Local PostgreSQL, `paperclip` database
- **No container:** Runs directly from repo checkout on `patches` branch
- **Service management:** Direct process (was systemd `paperclip.service`)
