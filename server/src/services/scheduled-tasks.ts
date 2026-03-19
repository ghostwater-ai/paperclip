import { and, asc, eq, lte } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { nextCronTickForTimeZone } from "./issues.js";
import { validateCron } from "./cron.js";

export interface ScheduledTaskHeartbeat {
  enqueueWakeup: (
    agentId: string,
    opts: {
      source: "automation";
      reason: "scheduled_task";
      payload: { issueId: string };
    },
  ) => Promise<unknown>;
}

export interface TickScheduledTasksResult {
  checked: number;
  fired: number;
  enqueued: number;
  advanced: number;
  disabled: number;
  skippedNoAssignee: number;
}

const log = logger.child({ service: "scheduled-tasks" });

export async function tickScheduledTasks(
  db: Db,
  heartbeat: ScheduledTaskHeartbeat,
  now: Date = new Date(),
): Promise<TickScheduledTasksResult> {
  const dueTemplates = await db
    .select({
      id: issues.id,
      companyId: issues.companyId,
      projectId: issues.projectId,
      title: issues.title,
      description: issues.description,
      assigneeAgentId: issues.assigneeAgentId,
      priority: issues.priority,
      schedule: issues.schedule,
      scheduleTimezone: issues.scheduleTimezone,
    })
    .from(issues)
    .where(
      and(
        eq(issues.isTemplate, true),
        eq(issues.scheduleEnabled, true),
        lte(issues.scheduleNextRunAt, now),
      ),
    )
    .orderBy(asc(issues.scheduleNextRunAt), asc(issues.createdAt));

  if (dueTemplates.length === 0) {
    return {
      checked: 0,
      fired: 0,
      enqueued: 0,
      advanced: 0,
      disabled: 0,
      skippedNoAssignee: 0,
    };
  }

  let enqueued = 0;
  let advanced = 0;
  let disabled = 0;
  let skippedNoAssignee = 0;

  for (const template of dueTemplates) {
    const run = await db.transaction(async (tx) => {
      const created = await tx
        .insert(issues)
        .values({
          companyId: template.companyId,
          projectId: template.projectId,
          title: template.title,
          description: template.description,
          assigneeAgentId: template.assigneeAgentId,
          priority: template.priority,
          status: "todo",
          isTemplate: false,
          schedule: null,
          scheduleTimezone: null,
          scheduleNextRunAt: null,
          scheduleEnabled: false,
        })
        .returning({
          id: issues.id,
          assigneeAgentId: issues.assigneeAgentId,
        })
        .then((rows) => rows[0]!);

      const schedule = template.schedule?.trim() ?? "";
      const scheduleTimezone = template.scheduleTimezone ?? "UTC";
      const isCron = schedule.length > 0 && validateCron(schedule) === null;

      if (isCron) {
        const nextRunAt = nextCronTickForTimeZone(schedule, now, scheduleTimezone);
        await tx
          .update(issues)
          .set({
            scheduleNextRunAt: nextRunAt,
            scheduleEnabled: nextRunAt !== null,
            updatedAt: now,
          })
          .where(eq(issues.id, template.id));

        return {
          issueId: created.id,
          assigneeAgentId: created.assigneeAgentId,
          advanced: nextRunAt !== null,
          disabled: nextRunAt === null,
        };
      }

      await tx
        .update(issues)
        .set({
          scheduleNextRunAt: null,
          scheduleEnabled: false,
          updatedAt: now,
        })
        .where(eq(issues.id, template.id));

      return {
        issueId: created.id,
        assigneeAgentId: created.assigneeAgentId,
        advanced: false,
        disabled: true,
      };
    });

    if (run.advanced) advanced += 1;
    if (run.disabled) disabled += 1;

    if (!run.assigneeAgentId) {
      skippedNoAssignee += 1;
      log.warn({ templateId: template.id, issueId: run.issueId }, "scheduled task fired without assignee; wakeup skipped");
      continue;
    }

    await heartbeat.enqueueWakeup(run.assigneeAgentId, {
      source: "automation",
      reason: "scheduled_task",
      payload: { issueId: run.issueId },
    });
    enqueued += 1;
  }

  return {
    checked: dueTemplates.length,
    fired: dueTemplates.length,
    enqueued,
    advanced,
    disabled,
    skippedNoAssignee,
  };
}
