---
shaping: true
---

# Session Key Routing Table — Shaping

**Issue:** [ghostwater-ai/paperclip#9](https://github.com/ghostwater-ai/paperclip/issues/9)

---

## Source

> Okay so we need to make sure:
> 1. The info available at the time of the event is sufficient to rebuild the full key
> 2. paperclip's open claw adapter uses it correctly to create the right key
> Effectively we need a way to customize session mapping for events. For example, I might want heartbeats in one session, issue updates in a per project per agent session, etc
>
> — James, 2026-03-11

> Okay but sometimes the dynamic value won't be one of those. It could be a slack channel id corresponding to the project
>
> — James, 2026-03-11

---

## Problem

The OpenClaw Gateway adapter resolves a single session key per agent via a strategy enum (`fixed`/`issue`/`run`), with a project-level override (PR #8). Users can't route different event types to different OpenClaw sessions. All heartbeats, issue updates, assignments, and on-demand triggers for an agent land in the same session — or the project override takes all of them.

Real need: heartbeats in a dedicated session, issue work in a project-specific Slack channel, assignments elsewhere. The dynamic values aren't always Paperclip-internal IDs — they can be arbitrary user-defined strings like Slack channel IDs stored on the project.

---

## Outcome

An agent's OpenClaw adapter can route different event types to different sessions using a configurable mapping, with template variables that resolve from event context including user-defined project fields.

---

## CURRENT System

| Part | Mechanism |
|------|-----------|
| **CUR1** | **Session key strategy** — `sessionKeyStrategy` enum on adapter config: `fixed` (default "paperclip"), `issue` (per-issue key), `run` (per-run key) |
| **CUR2** | **Project session key override** — `sessionKey` text column on `projects` table. When set, takes top priority over strategy in `resolveSessionKey()` |
| **CUR3** | **Resolution order** — `resolveSessionKey()`: project key → strategy-based key → fallback "paperclip" |
| **CUR4** | **Context enrichment** — `enrichWakeContextSnapshot()` in heartbeat.ts populates: `wakeReason`, `wakeSource`, `issueId`, `taskId`, `taskKey`, `commentId`, `projectId` |
| **CUR5** | **OpenClaw canonicalization** — OpenClaw prepends `agent:<configDefault>:` to bare session keys. "paperclip" → "agent:main:paperclip" |

### Context available at adapter execute time

| Field | Source | Present when |
|-------|--------|-------------|
| `context.wakeReason` | enrichWakeContextSnapshot | Always (set from `reason` param) |
| `context.wakeSource` | enrichWakeContextSnapshot | Always (set from `source` param) |
| `context.projectId` | workspace resolution | Event is project-scoped |
| `context.projectSessionKey` | PR #8 enrichment | Project has `sessionKey` set |
| `context.issueId` | enrichWakeContextSnapshot | Event involves an issue |
| `context.taskId` | enrichWakeContextSnapshot | Event involves an issue (mirrors issueId) |
| `context.taskKey` | enrichWakeContextSnapshot | Issue has a task key |
| `ctx.runId` | Always present | Always |
| `ctx.agent.id` | Always present | Always |
| `ctx.config.agentId` | Adapter config | When user configured OpenClaw agent ID |

### Known wake reasons

| Source | Reasons |
|--------|---------|
| `timer` | `heartbeat_timer`, `interval_elapsed` |
| `assignment` | `issue_assigned` |
| `automation` | `issue_created`, `issue_updated`, `issue_execution_promoted`, `issue_execution_issue_not_found`, `issue_execution_same_name`, `issue_execution_deferred` |
| `on_demand` | `manual`, `ping`, `callback`, `system` |

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | Route different event types to different OpenClaw sessions | Core goal |
| R1 | Template variables resolve from event context (wakeSource, wakeReason, projectId, issueId, runId, agentId) | Must-have |
| R2 | Support user-defined dynamic values (e.g. Slack channel ID stored on project) | Must-have |
| R3 | Backward compatible — no routing config = current behavior | Must-have |
| R4 | Configurable per agent through UI (list editor + JSON escape hatch) | Must-have |
| R5 | Unresolvable template variables produce a sensible fallback, not a broken key | Must-have |
| R6 | OpenClaw canonicalization (`agent:<default>:<key>`) continues to work correctly | Must-have |
| R7 | Glob pattern syntax with prefix matching (e.g. `automation:issue_*`) | Must-have |
| R8 | CLI support via `--adapter-config-file` (JSON file with routing rules) | Must-have |
| R9 | Projects can define their own routing rules that override agent-level table | Must-have |

---

## Shape A: Routing Table with Pattern Matching

Session key routing is a list of rules evaluated in order. Each rule has a **pattern** (matching `source:reason`) and a **template** (the session key to produce, with `{{variable}}` interpolation).

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **A1** | **Routing rule schema** — ordered array of `{ pattern: string, sessionKey: string }` in adapter config. Pattern is `source:reason` with `*` wildcard support (e.g. `timer:*`, `*:issue_created`, `*`). Template supports `{{var}}` interpolation. | |
| **A2** | **Template variable resolution** — resolver function takes event context and produces a flat `Record<string, string>` of available variables: `agentId`, `projectId`, `projectSessionKey`, `issueId`, `runId`, `wakeSource`, `wakeReason` | |
| **A3** | **Evaluation logic** — `resolveSessionKey()` replaced: iterate rules in order, first matching pattern wins. Interpolate template variables. If a referenced variable is empty, skip this rule and try next. Final fallback: current strategy-based logic (backward compat). | |
| **A4** | **UI — list editor + JSON toggle** — `RoutingRulesEditor` React component in openclaw-gateway config-fields.tsx. Each row: pattern input + session key template input. Add/remove/reorder. "Edit as JSON" toggle for power users. Wired via `mark("adapterConfig", "sessionKeyRouting", rules)`. | |
| **A5** | **Project sessionKey becomes template-only** — `projectSessionKey` no longer overrides at top priority in `resolveSessionKey()`. Instead available as `{{projectSessionKey}}` in templates. Rules that use it only fire when a project is in context AND has a sessionKey set. | |
| **A6** | **Per-project routing rules** — `projects` table gets a `sessionKeyRouting` JSON column (same schema as agent-level rules). Project `sessionKey` stays as the data source for `{{projectSessionKey}}`. When a project has routing rules AND the event is project-scoped, project rules are evaluated first. If no project rule matches, fall through to agent-level rules. UI: reuse `RoutingRulesEditor` in Project Properties + New Project dialog. | |
| **A7** | **CLI support** — `paperclipai agent update --adapter-config-file config.json` already works for flat config. Routing rules are part of adapter config, so they come along for free. Document the JSON schema for routing rules in the config file. | | |

### Example configuration

```
Rules (evaluated top to bottom):
1. timer:heartbeat_timer  →  heartbeat
2. timer:interval_elapsed →  heartbeat
3. assignment:*           →  {{projectSessionKey}}
4. automation:issue_*     →  {{projectSessionKey}}
5. *                      →  paperclip
```

With project sessionKey = `slack:channel:c0ag0u06yka`:
- Heartbeat → `heartbeat` → OpenClaw: `agent:main:heartbeat`
- Issue assigned to project → `slack:channel:c0ag0u06yka` → OpenClaw: `agent:main:slack:channel:c0ag0u06yka`
- Manual trigger without project → skips rules 3-4 (unresolvable), hits rule 5 → `paperclip`

### Pattern matching (glob)

Patterns use `source:reason` format with glob-style `*` wildcard:
- `*` alone matches everything
- `timer:*` matches any reason with source "timer"
- `*:issue_created` matches any source with reason "issue_created"
- `automation:issue_*` matches reasons starting with "issue_" under source "automation"
- Exact match: `timer:heartbeat_timer` matches only that combination

### Skip-on-unresolvable behavior

When a template references `{{projectSessionKey}}` but the event has no project or the project has no sessionKey, the rule is **skipped** and evaluation continues to the next rule. This means:
- Rules with dynamic variables are self-gating — they only fire when the data exists
- The fallback rule (`*` → `paperclip`) catches everything else
- No broken keys ever reach OpenClaw

### Per-project routing rules

Projects can define their own routing rules (same schema). Resolution order:
1. If event is project-scoped AND project has routing rules → evaluate project rules
2. If no project rule matches (or no project rules) → evaluate agent-level rules
3. If no agent rule matches → current strategy-based fallback

This means a project can say "my issue events go to `slack:channel:c0ag0u06yka`" without affecting other projects or non-project events.

---

## Fit Check

| Req | Requirement | Status | A |
|-----|-------------|--------|---|
| R0 | Route different event types to different OpenClaw sessions | Core goal | ✅ |
| R1 | Template variables resolve from event context | Must-have | ✅ |
| R2 | Support user-defined dynamic values (e.g. Slack channel ID on project) | Must-have | ✅ |
| R3 | Backward compatible — no routing config = current behavior | Must-have | ✅ |
| R4 | Configurable per agent through UI (list editor + JSON escape hatch) | Must-have | ✅ |
| R5 | Unresolvable template variables produce sensible fallback | Must-have | ✅ |
| R6 | OpenClaw canonicalization continues to work | Must-have | ✅ |
| R7 | Glob pattern syntax with prefix matching | Must-have | ✅ |
| R8 | CLI support via --adapter-config-file | Must-have | ✅ |
| R9 | Projects can define their own routing rules | Must-have | ✅ |

**Notes:**
- All requirements pass. No flagged unknowns remain.

---

---

## Breadboard

### Places

| # | Place | Description |
|---|-------|-------------|
| P1 | Agent Config — OpenClaw Gateway | Adapter config panel in agent settings |
| P2 | New Project Dialog | Modal for creating a new project |
| P3 | Project Properties | Panel for editing project settings |
| P4 | Backend — Server | Heartbeat service + adapter execution |

### UI Affordances

| # | Place | Component | Affordance | Control | Wires Out | Returns To |
|---|-------|-----------|------------|---------|-----------|------------|
| U1 | P1 | config-fields | Session strategy select | select | → N1 | — |
| U2 | P1 | config-fields | Session key input (fixed) | type | → N1 | — |
| U3 | P1 | RoutingRulesEditor | Rules list (rows of pattern + template) | render | — | — |
| U4 | P1 | RoutingRulesEditor | Add rule button | click | → N2 | — |
| U5 | P1 | RoutingRulesEditor | Remove rule button | click | → N3 | — |
| U6 | P1 | RoutingRulesEditor | Reorder handle (drag) | drag | → N4 | — |
| U7 | P1 | RoutingRulesEditor | Pattern input per row | type | → N5 | — |
| U8 | P1 | RoutingRulesEditor | Session key template input per row | type | → N5 | — |
| U9 | P1 | RoutingRulesEditor | "Edit as JSON" toggle | click | → N6 | — |
| U10 | P1 | RoutingRulesEditor | JSON textarea (when toggled) | type | → N7 | — |
| U11 | P2 | NewProjectDialog | Session key input | type | — | — |
| U12 | P2 | RoutingRulesEditor | Project routing rules (same component) | render | — | — |
| U13 | P3 | ProjectProperties | Session key input | type | → N8 | — |
| U14 | P3 | RoutingRulesEditor | Project routing rules (same component) | render | — | — |

### Code Affordances

| # | Place | Component | Affordance | Control | Wires Out | Returns To |
|---|-------|-----------|------------|---------|-----------|------------|
| N1 | P1 | config-fields | `mark("adapterConfig", "sessionKeyRouting", rules)` | call | — | → U3 |
| N2 | P1 | RoutingRulesEditor | append empty rule to array | call | — | → U3 |
| N3 | P1 | RoutingRulesEditor | splice rule from array | call | — | → U3 |
| N4 | P1 | RoutingRulesEditor | reorder array | call | — | → U3 |
| N5 | P1 | RoutingRulesEditor | update rule field in array | call | — | → U3 |
| N6 | P1 | RoutingRulesEditor | toggle JSON/list mode | call | — | → U3, → U10 |
| N7 | P1 | RoutingRulesEditor | parse JSON, validate, update rules | call | — | → U3 |
| N8 | P3 | ProjectProperties | `onUpdate({ sessionKey })` | call | — | — |
| N9 | P4 | heartbeat.ts | `enrichContextWithProjectSessionKey()` | call | → S2 | → N11 |
| N10 | P4 | heartbeat.ts | `enrichContextWithProjectRouting()` | call | → S3 | → N11 |
| N11 | P4 | execute.ts | `resolveSessionKeyFromRouting()` | call | → N12 | → S4 |
| N12 | P4 | execute.ts | `matchPattern(source:reason, pattern)` | call | — | → N11 |
| N13 | P4 | execute.ts | `interpolateTemplate(template, vars)` | call | — | → N11 |
| N14 | P4 | execute.ts | `resolveSessionKey()` (existing fallback) | call | — | → S4 |

### Data Stores

| # | Place | Store | Description |
|---|-------|-------|-------------|
| S1 | P4 | `adapterConfig.sessionKeyRouting` | Agent-level routing rules (JSON in adapter config) |
| S2 | P4 | `projects.sessionKey` | Per-project session key value (existing from PR #8) |
| S3 | P4 | `projects.sessionKeyRouting` | Per-project routing rules (new JSON column) |
| S4 | P4 | resolved `sessionKey` | Final session key sent in WebSocket payload |
| S5 | P4 | `context.*` | Template variable bag: wakeSource, wakeReason, projectId, issueId, runId, agentId, projectSessionKey |

### Wiring Narrative

**Agent config (P1):** User configures routing rules via list editor or JSON toggle. Rules are stored as `sessionKeyRouting` in adapter config alongside existing `sessionKeyStrategy` and `sessionKey`. Both systems coexist — rules take priority when present, strategy is the fallback.

**Project config (P2/P3):** User sets a `sessionKey` value (data, e.g. Slack channel ID) and optionally defines per-project routing rules. Both stored on the project.

**Runtime resolution (P4):** On each wake event:
1. `enrichContextWithProjectSessionKey()` loads project's `sessionKey` → available as `{{projectSessionKey}}`
2. `enrichContextWithProjectRouting()` loads project's `sessionKeyRouting` rules (NEW)
3. `resolveSessionKeyFromRouting()` evaluates: project rules first → agent rules → existing strategy fallback
4. For each rule: `matchPattern()` checks `source:reason` against glob pattern. If match, `interpolateTemplate()` resolves `{{vars}}`. If any var unresolvable, skip rule and try next.
5. Final `sessionKey` goes into WebSocket payload.

---

## Slices

| # | Slice | Mechanism | Demo |
|---|-------|-----------|------|
| V1 | Routing engine | A1-A3: schema, variable resolver, evaluation logic | "Configure rules in DB, heartbeat routes to correct session" |
| V2 | Agent config UI | A4: RoutingRulesEditor component | "Add/edit/reorder rules in agent config panel, toggle JSON view" |
| V3 | Per-project routing | A5-A6: project routing rules + sessionKey as template var | "Project with rules overrides agent routing for its events" |
| V4 | Project UI | A6: routing rules in project dialogs | "Configure project routing rules in New Project + Properties" |

### V1: Routing Engine (backend)

| # | Affordance | Notes |
|---|------------|-------|
| N11 | `resolveSessionKeyFromRouting()` | New function, replaces direct `resolveSessionKey()` call |
| N12 | `matchPattern()` | Glob matching: `*`, `source:*`, `automation:issue_*` |
| N13 | `interpolateTemplate()` | `{{var}}` replacement, returns null if any var missing |
| N14 | `resolveSessionKey()` | Existing — becomes inner fallback |
| S1 | `adapterConfig.sessionKeyRouting` | Read from adapter config |
| S5 | `context.*` | Template variable bag |

**Demo:** Set `sessionKeyRouting` directly in adapter config JSON. Fire heartbeat → routes to `heartbeat` session. Fire issue event → routes to `project-channel` session. No rules → falls back to existing strategy.

### V2: Agent Config UI

| # | Affordance | Notes |
|---|------------|-------|
| U3-U10 | RoutingRulesEditor | New reusable component |
| N1-N7 | Editor state management | Array manipulation + JSON toggle |

**Demo:** Open agent config, see routing rules editor below session strategy. Add rules, reorder, edit patterns/templates. Toggle to JSON view, edit raw, toggle back. Save — rules persist.

### V3: Per-Project Routing (backend)

| # | Affordance | Notes |
|---|------------|-------|
| N10 | `enrichContextWithProjectRouting()` | New — loads project rules into context |
| S3 | `projects.sessionKeyRouting` | New JSON column + migration |

**Demo:** Set project routing rules via DB. Fire project-scoped event → project rules win. Fire non-project event → agent rules used. Project with no rules → falls through to agent rules.

### V4: Project UI

| # | Affordance | Notes |
|---|------------|-------|
| U12 | RoutingRulesEditor in NewProjectDialog | Reuses V2 component |
| U14 | RoutingRulesEditor in ProjectProperties | Reuses V2 component |

**Demo:** Open project properties, see routing rules editor below session key field. Add project-specific rules. Create new project with routing rules.

---

## Decisions Made

| # | Question | Decision |
|---|----------|----------|
| Q1 | Rule editing UI | **(c)** List editor + "edit as JSON" toggle |
| Q2 | Pattern syntax | **(b)** Glob with prefix matching (`automation:issue_*`) |
| Q3 | CLI support | **(a)** Via `--adapter-config-file` (JSON file) |
| Q4 | Per-project routing | **(b)** Projects can define their own routing rules |
| Q5 | Scope | **(a)** Session key routing only (message templates separate) |

## Open Questions

1. ~~**A4 spike needed**~~ **Resolved:** Config fields are plain React components per adapter — no framework/schema system to extend. `OpenClawGatewayConfigFields` in `ui/src/adapters/openclaw-gateway/config-fields.tsx` is a regular React component using `Field`, `DraftInput`, and `<select>` primitives from `agent-config-primitives`. It reads/writes via `eff()` (read effective value) and `mark()` (write dirty value). Adding an ordered-list component is straightforward React — build a `RoutingRulesEditor` component with add/remove/reorder + JSON toggle, wire it with `mark("adapterConfig", "sessionKeyRouting", rules)`. No framework extension needed. A4 flag cleared.

2. ~~**A6 — project rules replace or coexist with project sessionKey?**~~ **Resolved:** Keep both. `sessionKey` is the data (user-defined value like a Slack channel ID), routing rules are the logic. `sessionKey` stays as `{{projectSessionKey}}` template variable. `sessionKeyRouting` is a new optional JSON column for per-project rules.

3. ~~**Empty rules array vs null**~~ **Resolved:** Both null and [] = fall through to agent-level rules.
