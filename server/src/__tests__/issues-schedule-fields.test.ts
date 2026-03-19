import { describe, expect, it } from "vitest";
import { resolveIssueScheduleFields } from "../services/issues.js";

describe("resolveIssueScheduleFields", () => {
  it("computes cron next run and marks templates", () => {
    const result = resolveIssueScheduleFields({
      now: new Date("2026-03-18T10:07:00.000Z"),
      patch: {
        schedule: "*/15 * * * *",
        scheduleTimezone: "UTC",
      },
    });

    expect(result.isTemplate).toBe(true);
    expect(result.scheduleEnabled).toBe(true);
    expect(result.scheduleNextRunAt?.toISOString()).toBe("2026-03-18T10:15:00.000Z");
  });

  it("supports pause and resume for cron schedules", () => {
    const paused = resolveIssueScheduleFields({
      now: new Date("2026-03-18T10:07:00.000Z"),
      existing: {
        schedule: "*/15 * * * *",
        scheduleTimezone: "UTC",
        scheduleEnabled: true,
        isTemplate: true,
      },
      patch: {
        scheduleEnabled: false,
      },
    });
    expect(paused.scheduleEnabled).toBe(false);
    expect(paused.scheduleNextRunAt).toBeNull();

    const resumed = resolveIssueScheduleFields({
      now: new Date("2026-03-18T10:07:00.000Z"),
      existing: {
        schedule: "*/15 * * * *",
        scheduleTimezone: "UTC",
        scheduleEnabled: false,
        isTemplate: true,
      },
      patch: {
        scheduleEnabled: true,
      },
    });
    expect(resumed.scheduleEnabled).toBe(true);
    expect(resumed.scheduleNextRunAt?.toISOString()).toBe("2026-03-18T10:15:00.000Z");
  });

  it("auto-disables one-shot schedules in the past", () => {
    const result = resolveIssueScheduleFields({
      now: new Date("2026-03-18T10:07:00.000Z"),
      patch: {
        schedule: "2026-03-18T09:00:00.000Z",
        scheduleTimezone: "UTC",
        scheduleEnabled: true,
      },
    });

    expect(result.isTemplate).toBe(true);
    expect(result.scheduleEnabled).toBe(false);
    expect(result.scheduleNextRunAt).toBeNull();
  });
});
