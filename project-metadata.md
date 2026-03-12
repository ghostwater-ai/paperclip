---
shaping: true
---

# Project Metadata & Dynamic Template Variables — Shaping

## Problem

Projects in Paperclip have no extensible fields. The only way to pass project-specific data to adapters (like a session key for routing) is to add dedicated columns. This is rigid — every new project-level variable requires a migration, schema change, and UI work.

Meanwhile, the routing engine's `interpolateTemplate` only resolves flat variables (`{{adapterAgentId}}`, `{{issueId}}`, etc.). There's no way to reference project-specific data in routing templates. Users want to write rules like `"agent:{{adapterAgentId}}:{{project.metadata.sessionKey}}"` but have no mechanism for it.

## Outcome

Users can store arbitrary key-value data on projects and reference it in routing templates via dot-path syntax. Adding a new project-level variable requires zero code changes — just update the project's metadata and reference it in a routing rule.

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | Projects have extensible key-value storage | Core goal |
| R1 | Template variables support dot-path resolution (e.g., `{{project.metadata.key}}`) | Core goal |
| R2 | All metadata keys are available as template variables without code changes | Must-have |
| R3 | Metadata editable from project UI | Must-have |
| R4 | Metadata editable from CLI | Must-have |
| R5 | Routing help modal documents dot-path variables | Must-have |
| R6 | Unknown dot-path variables fall through (same as current unknown variable behavior) | Must-have |
| R7 | No dedicated `sessionKey` column — use metadata for this | Must-have |

---

## A: JSONB metadata column + dot-path interpolation

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **A1** | **`metadata` JSONB column on `projects` table** — nullable, defaults null. Migration adds column. No schema constraints on keys/values. | |
| **A2** | **Dot-path variable resolution in `interpolateTemplate`** — extend regex from `{{key}}` to `{{key.sub.path}}`. Resolver walks a nested variables object using dot segments. Returns empty string for missing paths (same as current behavior for unknown flat vars). | |
| **A3** | **Project data injection into routing variables** — at execution time, load project row (already happens at L1135 for `executionWorkspacePolicy`), inject `project.metadata.*` into the variables map as nested object. Also inject `project.id`, `project.name` for free. | |
| **A4** | **Unknown dot-path variable detection** — extend the `hasUnknownVar` check in `resolveSessionKeyFromRouting` to handle dot-path variables. A variable is "known" if the dot-path resolves to a non-null value in the nested variables object. | |
| **A5** | **UI: JSON editor on ProjectProperties** — same pattern as `payloadTemplate` on agent config. Renders a JSON editor for `metadata` field. No schema enforcement — free-form object. | |
| **A6** | **CLI: project commands** — `project list`, `project get <id>`, `project update <id> --metadata <jsonOrFile>`. Follow existing `agent` command patterns. | |
| **A7** | **Help modal update** — add `project.metadata.<key>` to the template variables table in RoutingRulesEditor help dialog. Document that any key in project metadata is automatically available. | |

---

## Fit Check: R × A

| Req | Requirement | Status | A |
|-----|-------------|--------|---|
| R0 | Projects have extensible key-value storage | Core goal | ✅ |
| R1 | Template variables support dot-path resolution | Core goal | ✅ |
| R2 | All metadata keys available without code changes | Must-have | ✅ |
| R3 | Metadata editable from project UI | Must-have | ✅ |
| R4 | Metadata editable from CLI | Must-have | ✅ |
| R5 | Routing help modal documents dot-path variables | Must-have | ✅ |
| R6 | Unknown dot-path variables fall through | Must-have | ✅ |
| R7 | No dedicated sessionKey column | Must-have | ✅ |

---

## Open Questions

None — scope is clear.

## Implementation Notes

### Current state of `interpolateTemplate`

```typescript
// Current: flat key lookup only
template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => replace(key))
```

Needs to become:
```typescript
// New: dot-path support
template.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_match, path) => resolveDotPath(variables, path))
```

### Where project data is loaded

`heartbeat.ts` L1133-1138 already queries the projects table for `executionWorkspacePolicy` using `executionProjectId`. Adding `metadata` to that select is a one-line change. The resolved project data then needs to flow through to `resolveSessionKeyFromRouting` in `execute.ts`.

### Current context flow

`ctx.context` (Record<string, unknown>) carries `projectId`, `wakeSource`, `wakeReason`, etc. Project metadata would be injected here (e.g., `ctx.context.projectMetadata = row.metadata`) so the adapter can read it at routing time.

### CLI project commands

No `project` CLI commands exist today. Agent CLI (`agent list/get/update/delete`) at `cli/src/commands/client/agent.ts` is the pattern to follow. The API endpoints for projects already exist (UI uses them).
