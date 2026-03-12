---
shaping: true
---

# Scheduled Tasks — Shaping

## Source

> I've been thinking about heartbeat templates and all that, and it dawned on me that the simplest way to do what I want is just to add the crons to tasks. Then you can write a reusable task, add a schedule, and a new iteration of that task will be spun up every time the cron fires and the assignee will just get the event.
> — James, 2026-03-18

> Upstream RFC #219 proposes a separate `routines` table orthogonal to issues. Explicitly rejects schedule-on-tasks: "High complexity (recurrence logic, cloning, state machine for skipped/overdue instances, template vs instance editing)." We disagree — template/instance separation handles these cleanly without a parallel entity.

---

## Problem

Agents can only be woken by heartbeat timers (fixed interval) or task assignment events. There's no way to say "run this task every Monday at 9am" or "do this once at 3pm Tuesday." Users who want periodic agent work (inbox checks, report generation, code review sweeps) must either abuse heartbeat intervals or manually create tasks on a schedule.

## Outcome

Users can attach a cron schedule (recurring) or a one-shot time (single future fire) to a task. When the schedule fires, a fresh task instance is created and the assigned agent is woken with the task's full context. Schedules are visible and manageable from a dedicated tab on the project board.

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | Agent receives a wake event with task context when a schedule fires | Core goal |
| R1 | Supports recurring schedules via cron expressions | Must-have |
| R2 | Supports one-shot scheduled tasks (fire once at a specific time) | Must-have |
| R3 | Each schedule fire creates a fresh task instance (not reuse) | Must-have |
| R4 | Schedules can be paused and resumed without deletion | Must-have |
| R5 | Template tasks live in a Schedules tab on the project board, not on the main board | Must-have |
| R6 | Editing a template affects future instances only, not existing ones | Must-have |
| R7 | Timezone support for cron expressions | Must-have |
| R8 | Integrates with existing wake pipeline (enqueueWakeup) | Must-have |

---

## A: Template Tasks with Schedule Field

Tasks with a schedule become templates. When the scheduler ticks, it clones templates into fresh instances and wakes the assigned agent.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **A1** | **Schema: schedule fields on issues table** | |
| A1.1 | Add `schedule` (text, nullable) — cron expression or ISO-8601 timestamp for one-shot | |
| A1.2 | Add `schedule_timezone` (text, nullable, default UTC) — IANA timezone string | |
| A1.3 | Add `schedule_next_run_at` (timestamp, nullable) — precomputed next fire time | |
| A1.4 | Add `schedule_enabled` (boolean, default true) — pause/resume toggle | |
| A1.5 | Add `is_template` (boolean, default false) — marks task as schedule template | |
| A1.6 | Index: `WHERE is_template = true AND schedule_enabled = true AND schedule_next_run_at <= now()` | |
| **A2** | **Scheduler service** | |
| A2.1 | `tickScheduledTasks(db, heartbeat, now)` — query due templates, create instances, wake agents | |
| A2.2 | Runs alongside existing `heartbeat.tickTimers(now)` in server tick loop (same 30s interval) | |
| A2.3 | Uses existing `cron-parser` package (already in codebase for plugin jobs) to compute `schedule_next_run_at` | |
| A2.4 | After firing: if cron → compute next run; if one-shot → set `schedule_enabled = false` | |
| **A3** | **Instance creation (clone)** | |
| A3.1 | Clone template fields: `title`, `description`, `assigneeAgentId`, `projectId`, `priority` | |
| A3.2 | Instance is a normal task: `is_template = false`, no schedule fields, status = `todo` | |
| A3.3 | No `templateId` back-reference (decided: adds complexity, low value) | |
| **A4** | **Wake integration** | |
| A4.1 | After instance creation, call `heartbeat.enqueueWakeup()` with `source: "automation"`, `reason: "scheduled_task"` | |
| A4.2 | Payload includes `issueId` of the new instance (not the template) | |
| A4.3 | Agent receives the instance as a normal assigned task — no adapter changes needed | |
| **A5** | **API endpoints** | |
| A5.1 | Extend existing `POST /api/issues` to accept schedule fields when `is_template = true` | |
| A5.2 | Extend existing `PATCH /api/issues/:id` to update schedule fields | |
| A5.3 | Add `GET /api/projects/:id/schedules` — list templates for a project (Schedules tab) | |
| A5.4 | Add `POST /api/issues/:id/pause` and `/resume` convenience endpoints (or use PATCH) | |
| **A6** | **UI: Schedules tab** | |
| A6.1 | "Schedules" tab on project board (alongside existing Issues tab) — table/list of template tasks showing: title, cron expression (human-readable), timezone, next run time, assignee, enabled toggle | |
| A6.2 | Create schedule: reuse existing issue creation form/dialog, add schedule fields — cron expression text input with placeholder examples, timezone select (IANA zones), OR one-shot datetime picker. `is_template` set automatically when schedule is provided | |
| A6.3 | Edit schedule: same form, pre-populated. Follows existing issue edit patterns | |
| A6.4 | Enabled/disabled toggle inline on the schedule row (shadcn Switch component) | |
| A6.5 | Filter templates out of main Issues tab via `is_template = false` default filter | |

---

## Fit Check

| Req | Requirement | Status | A |
|-----|-------------|--------|---|
| R0 | Agent receives a wake event with task context when a schedule fires | Core goal | ✅ |
| R1 | Supports recurring schedules via cron expressions | Must-have | ✅ |
| R2 | Supports one-shot scheduled tasks (fire once at a specific time) | Must-have | ✅ |
| R3 | Each schedule fire creates a fresh task instance (not reuse) | Must-have | ✅ |
| R4 | Schedules can be paused and resumed without deletion | Must-have | ✅ |
| R5 | Template tasks live in a Schedules tab on the project board, not on the main board | Must-have | ✅ |
| R6 | Editing a template affects future instances only, not existing ones | Must-have | ✅ |
| R7 | Timezone support for cron expressions | Must-have | ✅ |
| R8 | Integrates with existing wake pipeline (enqueueWakeup) | Must-have | ✅ |

**Notes:**
- R6 is satisfied by A3's clone design: instances copy fields at creation time, subsequent template edits don't propagate.

---

## Slices

### V1: Backend — Schema, Scheduler, API

**Parts:** A1 (schema) + A2 (scheduler) + A3 (instance creation) + A4 (wake integration) + A5 (API)

**Demo:** Create a template task via API with a cron schedule. Watch the scheduler tick, create a fresh instance, and wake the assigned agent.

**Includes:**
- Migration: add `schedule`, `schedule_timezone`, `schedule_next_run_at`, `schedule_enabled`, `is_template` to issues table
- Shared types: extend Issue type with schedule fields
- Scheduler service: `tickScheduledTasks()` in server tick loop
- Clone logic: template → instance with title, description, assignee, project, priority
- Wake: `enqueueWakeup()` with `source: "automation"`, `reason: "scheduled_task"`
- API: extend issue create/update to accept schedule fields, add `GET /api/projects/:id/schedules`
- One-shot: ISO-8601 in `schedule` field, auto-disable after fire
- Tests: scheduler tick, clone correctness, one-shot auto-disable, cron next-run computation

### V2: UI — Schedules Tab

**Parts:** A6

**Demo:** Navigate to a project board, click Schedules tab, see template tasks with schedule info. Create, edit, pause/resume schedules from the UI.

**Includes:**
- Schedules tab on project board
- Template list view: title, human-readable schedule, timezone, next run, assignee, enabled toggle
- Create/edit schedule form reusing issue creation patterns + schedule-specific fields
- Filter `is_template = true` out of main Issues tab
- Tests: tab renders, toggle works, create form submits correctly
