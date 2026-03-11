import { describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { enrichContextWithProjectRouting, enrichContextWithProjectSessionKey } from "../services/heartbeat.ts";

function mockDbProjectRow(projectRow: { sessionKey: string | null; sessionKeyRouting?: unknown }): Db {
  return {
    select: () => ({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              sessionKey: projectRow.sessionKey,
              sessionKeyRouting: projectRow.sessionKeyRouting ?? null,
            },
          ]),
      }),
    }),
  } as unknown as Db;
}

describe("enrichContextWithProjectSessionKey", () => {
  it("adds projectSessionKey to context when the resolved project has a non-empty session key", async () => {
    const context: Record<string, unknown> = {
      projectId: "project-123",
    };

    const resolved = await enrichContextWithProjectSessionKey({
      db: mockDbProjectRow({ sessionKey: "paperclip:project:alpha" }),
      companyId: "company-123",
      context,
    });

    expect(resolved).toBe("paperclip:project:alpha");
    expect(context.projectSessionKey).toBe("paperclip:project:alpha");
  });
});

describe("enrichContextWithProjectRouting", () => {
  it("adds projectSessionKeyRouting to context when the resolved project has valid routing rules", async () => {
    const context: Record<string, unknown> = {
      projectId: "project-123",
    };

    const resolved = await enrichContextWithProjectRouting({
      db: mockDbProjectRow({
        sessionKey: null,
        sessionKeyRouting: [{ pattern: "assignment:*", sessionKey: "{{projectSessionKey}}" }],
      }),
      companyId: "company-123",
      context,
    });

    expect(resolved).toEqual([{ pattern: "assignment:*", sessionKey: "{{projectSessionKey}}" }]);
    expect(context.projectSessionKeyRouting).toEqual([
      { pattern: "assignment:*", sessionKey: "{{projectSessionKey}}" },
    ]);
  });

  it("falls through when project routing is null or empty", async () => {
    const withNull: Record<string, unknown> = {
      projectId: "project-123",
      projectSessionKeyRouting: [{ pattern: "*", sessionKey: "stale" }],
    };
    const resolvedNull = await enrichContextWithProjectRouting({
      db: mockDbProjectRow({ sessionKey: null, sessionKeyRouting: null }),
      companyId: "company-123",
      context: withNull,
    });
    expect(resolvedNull).toBeNull();
    expect(withNull.projectSessionKeyRouting).toBeUndefined();

    const withEmpty: Record<string, unknown> = {
      projectId: "project-123",
      projectSessionKeyRouting: [{ pattern: "*", sessionKey: "stale" }],
    };
    const resolvedEmpty = await enrichContextWithProjectRouting({
      db: mockDbProjectRow({ sessionKey: null, sessionKeyRouting: [] }),
      companyId: "company-123",
      context: withEmpty,
    });
    expect(resolvedEmpty).toBeNull();
    expect(withEmpty.projectSessionKeyRouting).toBeUndefined();
  });
});
