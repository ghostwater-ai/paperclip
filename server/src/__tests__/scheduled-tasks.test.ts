import { describe, expect, it, vi } from "vitest";
import { tickScheduledTasks } from "../services/scheduled-tasks.js";

type DueTemplate = {
  id: string;
  companyId: string;
  projectId: string | null;
  title: string;
  description: string | null;
  assigneeAgentId: string | null;
  priority: string;
  schedule: string | null;
  scheduleTimezone: string | null;
};

function createHarness(dueTemplates: DueTemplate[]) {
  const insertedRows: Array<Record<string, unknown>> = [];
  const templateUpdates: Array<Record<string, unknown>> = [];

  let companyCounter = 100;

  const tx = {
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => {
        insertedRows.push(values);
        return {
          returning: (selector?: unknown) => ({
            then: async (fn: (rows: unknown[]) => unknown) =>
              fn([
                {
                  id: `issue-instance-${insertedRows.length}`,
                  assigneeAgentId: values.assigneeAgentId ?? null,
                },
              ]),
          }),
        };
      },
    })),
    update: vi.fn(() => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          // If this is the companies counter update (has issueCounter), return with returning()
          if ("issueCounter" in (values as any)) {
            companyCounter += 1;
            return {
              returning: async () => [
                { issueCounter: companyCounter, issuePrefix: "ABI" },
              ],
            };
          }
          // Otherwise it's a template update
          templateUpdates.push(values);
          return Promise.resolve();
        },
      }),
    })),
  };

  const db = {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          orderBy: async () => dueTemplates,
        }),
      }),
    })),
    transaction: vi.fn(async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const heartbeat = {
    enqueueWakeup: vi.fn(async () => ({ id: "wakeup-1" })),
  };

  return {
    db: db as any,
    heartbeat,
    insertedRows,
    templateUpdates,
  };
}

describe("tickScheduledTasks", () => {
  it("clones due cron templates, enqueues wakeups, and advances next run", async () => {
    const now = new Date("2026-03-18T10:07:00.000Z");
    const harness = createHarness([
      {
        id: "tmpl-1",
        companyId: "company-1",
        projectId: "project-1",
        title: "Nightly sync",
        description: "Run scheduled sync",
        assigneeAgentId: "agent-1",
        priority: "high",
        schedule: "*/15 * * * *",
        scheduleTimezone: "UTC",
      },
    ]);

    const result = await tickScheduledTasks(harness.db, harness.heartbeat, now);

    expect(result).toEqual({
      checked: 1,
      fired: 1,
      enqueued: 1,
      advanced: 1,
      disabled: 0,
      skippedNoAssignee: 0,
    });
    expect(harness.insertedRows).toEqual([
      expect.objectContaining({
        companyId: "company-1",
        projectId: "project-1",
        title: "Nightly sync",
        description: "Run scheduled sync",
        assigneeAgentId: "agent-1",
        priority: "high",
        isTemplate: false,
        status: "todo",
        issueNumber: 101,
        identifier: "ABI-101",
        schedule: null,
        scheduleTimezone: null,
        scheduleNextRunAt: null,
        scheduleEnabled: false,
      }),
    ]);
    expect(harness.templateUpdates).toEqual([
      expect.objectContaining({
        scheduleEnabled: true,
        updatedAt: now,
      }),
    ]);
    expect((harness.templateUpdates[0]?.scheduleNextRunAt as Date).toISOString()).toBe("2026-03-18T10:15:00.000Z");
    expect(harness.heartbeat.enqueueWakeup).toHaveBeenCalledWith("agent-1", {
      source: "automation",
      reason: "scheduled_task",
      payload: { issueId: "issue-instance-1" },
    });
  });

  it("disables one-shot templates after firing", async () => {
    const now = new Date("2026-03-18T10:07:00.000Z");
    const harness = createHarness([
      {
        id: "tmpl-2",
        companyId: "company-1",
        projectId: null,
        title: "One shot",
        description: null,
        assigneeAgentId: "agent-2",
        priority: "medium",
        schedule: "2026-03-18T10:00:00.000Z",
        scheduleTimezone: "UTC",
      },
    ]);

    const result = await tickScheduledTasks(harness.db, harness.heartbeat, now);

    expect(result.disabled).toBe(1);
    expect(result.advanced).toBe(0);
    expect(harness.templateUpdates).toEqual([
      expect.objectContaining({
        scheduleEnabled: false,
        scheduleNextRunAt: null,
      }),
    ]);
  });

  it("is a no-op when no templates are due", async () => {
    const harness = createHarness([]);

    const result = await tickScheduledTasks(harness.db, harness.heartbeat, new Date("2026-03-18T10:07:00.000Z"));

    expect(result).toEqual({
      checked: 0,
      fired: 0,
      enqueued: 0,
      advanced: 0,
      disabled: 0,
      skippedNoAssignee: 0,
    });
    expect(harness.db.transaction).not.toHaveBeenCalled();
    expect(harness.heartbeat.enqueueWakeup).not.toHaveBeenCalled();
  });
});
