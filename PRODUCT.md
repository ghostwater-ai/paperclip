# PRODUCT.md — Paperclip Fork (ghostwater-ai/paperclip)

## Layer 1: What Is This Thing?

Our fork of Paperclip — the open-source orchestration layer that gives autonomous AI agent teams an org chart, task board, budgets, heartbeat-driven execution, and a dashboard UI.

**Who uses it:** Teams running multiple AI agents (via OpenClaw, Claude Code, Codex, etc.) that need coordination, task assignment, and visibility across agents.

**Why they care:** Single control plane for a multi-agent company — assign goals, delegate tasks, track costs, enforce governance, and let agents self-organize via heartbeat wakes.

**Internal tool.** Fork of upstream open-source project.

**Tech stack:**
- Node.js/Express/TypeScript server, Drizzle ORM, PostgreSQL
- React/Vite/Tailwind/shadcn UI
- BetterAuth (cookie-based)
- Pluggable adapters: OpenClaw Gateway (WebSocket), Claude/Codex (local process), Bash, HTTP
- pnpm monorepo: server, ui, cli, packages/db, packages/shared, packages/adapters/*, packages/plugins/*

**Repo:** ghostwater-ai/paperclip (fork of paperclipai/paperclip)
**Branch model:** `main` mirrors upstream (fast-forward only). All custom work on `patches`.
**Deployed:** ore-01, port 3100, running directly from checkout

---

## Layer 2: What Matters Right Now?

**Current focus:** Ship fork patches that make Paperclip usable as the control plane for our multi-agent team. Prioritize features that unblock agent autonomy: routing, scheduling, per-agent config.

**What "done" looks like:**
- Agents receive correctly routed wakes based on project + event type
- Scheduled tasks fire reliably on cron/one-shot schedules
- Each agent reads its own API key from its own workspace
- PATCH endpoints don't wipe agent configs

**Known constraints:**
- Single upstream maintainer (cryppadotta) — slow merge cycles, so we ship on fork first
- 23 commits diverged from upstream; rebase tax increases with each sync
- No CI pipeline on the fork yet

**What we're NOT doing:**
- Hosted/SaaS version
- Full test suite remediation (17 pre-existing upstream failures are accepted debt)
- Major UI redesign — follow upstream patterns

### Patches We Carry

1. **OpenClaw Gateway adapter** — Adapter was present upstream but not wired into UI. Enabled it, fixed missing message field, added static agentId handling.
2. **Agent CLI subcommands** — `agent create`, `agent update`, `agent delete` with full adapterConfig support.
3. **Session key routing engine** — Rule-based routing with template variables. Pattern matching with `{{project.metadata.sessionKey}}` interpolation.
4. **Project metadata JSONB** — `metadata` column on projects table (migration 0038). Enables per-project Slack channel routing.
5. **Per-agent API key path** — `apiKeyPath` in adapter config for multi-workspace agent setups.
6. **PATCH endpoint shallow-merge fix** — Shallow-merges `adapterConfig`/`runtimeConfig` instead of replacing. 422 guard for non-object runtimeConfig. Upstream PR open.
7. **Scheduled tasks** — Template tasks with cron or one-shot ISO-8601 timestamps. Scheduler runs alongside heartbeat tick loop (~30s). Migration 0039.
8. **Scheduled task identifier fix** — Cloned instances get proper `issueNumber`/`identifier`.

---

## Layer 3: What The App Does

### Wake Routing via OpenClaw [PC-001]

When Paperclip needs to wake an agent (for a task assignment, scheduled task, or heartbeat), it dispatches through the agent's configured adapter. For OpenClaw agents, the wake payload includes the task context, API key path, and session routing information.

Session keys are resolved using the routing engine — rules that match on event type and project, then resolve template variables like `{{project.metadata.sessionKey}}` to determine which OpenClaw session receives the wake. Unresolved template variables cause the rule to be skipped (falling through to the next rule), rather than sending to a malformed session.

### Agent CLI Management [PC-002]

You can manage agents from the command line: `agent create` with adapter type and full adapterConfig, `agent update` to modify config, `agent delete` to remove an agent. The CLI handles the full adapterConfig structure so you don't need to use the API directly.

### Config Preservation on Updates [PC-003]

When you update an agent's config via the API (`PATCH /api/agents/:id`), the endpoint shallow-merges `adapterConfig` and `runtimeConfig` with existing values. Sending a partial update doesn't wipe unrelated fields — if you update `apiKeyPath`, your `gatewayUrl` stays intact. Non-object `runtimeConfig` values are rejected with a 422.

### Scheduled Tasks [PC-004]

You can create template tasks with cron expressions or one-shot ISO-8601 timestamps. The scheduler runs alongside the heartbeat tick loop (roughly every 30 seconds), checking for templates that are due. When a template fires, Paperclip clones it into a fresh task instance with a proper issue number and identifier, then enqueues a wake for the assigned agent.

One-shot tasks automatically disable after firing. Cron tasks keep firing on schedule.

### Per-Agent API Key Isolation [PC-005]

Each agent's adapter config can specify an `apiKeyPath` pointing to where that agent's API key lives on disk. This means multiple agents on the same host each read their own key from their own workspace directory, rather than sharing a single key file.

### Task Board and Assignment [PC-006]

Paperclip provides a web-based task board where you can create issues, assign them to agents, set priorities, and track status. When a task is assigned, the assignment wake resets the agent's task session — implementing a push model where agents are told to work rather than polling for changes.

### Heartbeat System [PC-007]

The heartbeat system periodically wakes agents based on configurable timers. Wake events come from four sources: timer (periodic), assignment (push when assigned), on-demand (manual trigger), and automation (scheduled tasks).

### What's Not Yet Built

**Wake template customization [PC-008]:** Wake text is not yet customizable per agent, project, or event type — everyone gets the same default wake template. Cascading template resolution (agent → project → default) and variable interpolation in wake text are planned.

**Self-wake suppression [PC-009]:** Completing a task can trigger a redundant wake for the completing agent, and self-authored comments can wake the comment author. Wakes for already-done issues aren't skipped.

---

## Layer 4: Quality Bar

- PATCH endpoints that accept nested objects must shallow-merge, never replace. This applies to `adapterConfig`, `runtimeConfig`, and `metadata`.
- Session key routing must resolve all template variables before dispatching. Malformed results (empty, trailing colon, double colon) are skipped.
- `main` branch mirrors upstream `master` (fast-forward only, never commit directly). All custom work goes on `patches`.
- Fork migrations start at 0038+. Watch for numbering collisions on upstream sync.
- Cloned task instances must always receive a valid `issueNumber` by incrementing the company issue counter.
