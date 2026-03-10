import { describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { enrichContextWithProjectSessionKey } from "../services/heartbeat.ts";

function mockDbWithSessionKey(sessionKey: string | null): Db {
  return {
    select: () => ({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              sessionKey,
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
      db: mockDbWithSessionKey("paperclip:project:alpha"),
      companyId: "company-123",
      context,
    });

    expect(resolved).toBe("paperclip:project:alpha");
    expect(context.projectSessionKey).toBe("paperclip:project:alpha");
  });
});
