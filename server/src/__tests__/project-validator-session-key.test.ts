import { describe, expect, it } from "vitest";
import { createProjectSchema, updateProjectSchema } from "@paperclipai/shared";

describe("project schema sessionKey contract", () => {
  it("accepts string, null, and omitted sessionKey for create", () => {
    const withString = createProjectSchema.parse({
      name: "Core Platform",
      sessionKey: "paperclip:core-platform",
    });
    expect(withString.sessionKey).toBe("paperclip:core-platform");

    const withNull = createProjectSchema.parse({
      name: "Core Platform",
      sessionKey: null,
    });
    expect(withNull.sessionKey).toBeNull();

    const omitted = createProjectSchema.parse({
      name: "Core Platform",
    });
    expect(omitted.sessionKey).toBeUndefined();
  });

  it("accepts string, null, and omitted sessionKey for update", () => {
    const withString = updateProjectSchema.parse({
      sessionKey: "paperclip:core-platform",
    });
    expect(withString.sessionKey).toBe("paperclip:core-platform");

    const withNull = updateProjectSchema.parse({
      sessionKey: null,
    });
    expect(withNull.sessionKey).toBeNull();

    const omitted = updateProjectSchema.parse({});
    expect(omitted.sessionKey).toBeUndefined();
  });

  it("rejects invalid sessionKey types", () => {
    expect(() =>
      createProjectSchema.parse({
        name: "Core Platform",
        sessionKey: 123,
      }),
    ).toThrow();

    expect(() =>
      updateProjectSchema.parse({
        sessionKey: { value: "paperclip:core-platform" },
      }),
    ).toThrow();
  });
});
