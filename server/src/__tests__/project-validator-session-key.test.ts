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

  it("accepts array, null, and omitted sessionKeyRouting for create/update", () => {
    const rules = [{ pattern: "assignment:*", sessionKey: "{{projectSessionKey}}" }];

    const createWithRules = createProjectSchema.parse({
      name: "Core Platform",
      sessionKeyRouting: rules,
    });
    expect(createWithRules.sessionKeyRouting).toEqual(rules);

    const createWithNull = createProjectSchema.parse({
      name: "Core Platform",
      sessionKeyRouting: null,
    });
    expect(createWithNull.sessionKeyRouting).toBeNull();

    const createOmitted = createProjectSchema.parse({ name: "Core Platform" });
    expect(createOmitted.sessionKeyRouting).toBeUndefined();

    const updateWithRules = updateProjectSchema.parse({
      sessionKeyRouting: rules,
    });
    expect(updateWithRules.sessionKeyRouting).toEqual(rules);

    const updateWithNull = updateProjectSchema.parse({
      sessionKeyRouting: null,
    });
    expect(updateWithNull.sessionKeyRouting).toBeNull();

    const updateOmitted = updateProjectSchema.parse({});
    expect(updateOmitted.sessionKeyRouting).toBeUndefined();
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

  it("rejects invalid sessionKeyRouting shapes", () => {
    expect(() =>
      createProjectSchema.parse({
        name: "Core Platform",
        sessionKeyRouting: [{ pattern: "assignment:*" }],
      }),
    ).toThrow();

    expect(() =>
      updateProjectSchema.parse({
        sessionKeyRouting: [{ pattern: "", sessionKey: "route" }],
      }),
    ).toThrow();
  });
});
