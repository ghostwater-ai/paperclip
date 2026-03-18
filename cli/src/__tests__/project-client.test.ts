import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "@paperclipai/shared";
import {
  executeProjectGet,
  executeProjectList,
  executeProjectUpdate,
  parseProjectMetadataFlag,
  registerProjectCommands,
} from "../commands/client/project.js";

function createTempJsonFile(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-project-cli-"));
  const filePath = path.join(dir, "metadata.json");
  fs.writeFileSync(filePath, contents, "utf8");
  return filePath;
}

function makeProject(overrides: Partial<Project> = {}): Project {
  const project: Project = {
    id: "project-1",
    companyId: "company-1",
    urlKey: "project-1",
    goalId: null,
    goalIds: [],
    goals: [],
    name: "Project One",
    description: null,
    status: "planned",
    leadAgentId: null,
    targetDate: null,
    color: null,
    pauseReason: null,
    pausedAt: null,
    metadata: null,
    executionWorkspacePolicy: null,
    codebase: {
      workspaceId: null,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
      repoName: null,
      localFolder: null,
      managedFolder: "/tmp/project-1",
      effectiveLocalFolder: "/tmp/project-1",
      origin: "local_folder",
    },
    workspaces: [],
    primaryWorkspace: null,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
  return {
    ...project,
    pauseReason: project.pauseReason ?? null,
    pausedAt: project.pausedAt ?? null,
  };
}

describe("registerProjectCommands", () => {
  it("registers only list/get/update subcommands", () => {
    const program = new Command();
    registerProjectCommands(program);
    const project = program.commands.find((command) => command.name() === "project");
    const names = (project?.commands ?? []).map((command) => command.name()).sort();
    expect(names).toEqual(["get", "list", "update"]);
  });
});

describe("parseProjectMetadataFlag", () => {
  it("parses inline JSON object", async () => {
    await expect(parseProjectMetadataFlag('{"sessionKey":"abc"}')).resolves.toEqual({
      sessionKey: "abc",
    });
  });

  it("parses JSON object from @filepath", async () => {
    const filePath = createTempJsonFile('{"routing":{"session":"a-1"}}');
    await expect(parseProjectMetadataFlag(`@${filePath}`)).resolves.toEqual({
      routing: { session: "a-1" },
    });
  });

  it("parses null metadata", async () => {
    await expect(parseProjectMetadataFlag("null")).resolves.toBeNull();
  });

  it("throws deterministic error for invalid inline JSON", async () => {
    await expect(parseProjectMetadataFlag('{"broken"')).rejects.toThrow(/Invalid JSON for --metadata/);
  });

  it("throws deterministic error for unreadable @filepath", async () => {
    const missingPath = path.join(os.tmpdir(), `missing-project-metadata-${Date.now()}.json`);
    await expect(parseProjectMetadataFlag(`@${missingPath}`))
      .rejects.toThrow(`Failed to read --metadata file '${missingPath}'`);
  });

  it("throws when JSON is not object/null", async () => {
    await expect(parseProjectMetadataFlag("[1,2,3]"))
      .rejects.toThrow(/expected a JSON object or null/);
  });
});

describe("project command execution helpers", () => {
  it("lists company projects", async () => {
    const getSpy = vi.fn().mockResolvedValue([makeProject({ id: "project-a" })]);
    const result = await executeProjectList(
      {
        apiBase: "http://localhost:3100",
        companyId: "company-123",
      },
      {
        resolveContext: () => ({
          api: { get: getSpy } as any,
          companyId: "company-123",
          profileName: "default",
          profile: {} as any,
          json: false,
        }),
      },
    );

    expect(getSpy).toHaveBeenCalledWith("/api/companies/company-123/projects");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe("project-a");
    expect(result.json).toBe(false);
  });

  it("gets one project by id", async () => {
    const project = makeProject({ id: "project-abc", metadata: { sessionKey: "s-1" } });
    const getSpy = vi.fn().mockResolvedValue(project);
    const result = await executeProjectGet(
      "project-abc",
      { apiBase: "http://localhost:3100" },
      {
        resolveContext: () => ({
          api: { get: getSpy } as any,
          companyId: undefined,
          profileName: "default",
          profile: {} as any,
          json: true,
        }),
      },
    );

    expect(getSpy).toHaveBeenCalledWith("/api/projects/project-abc");
    expect(result.row.metadata).toEqual({ sessionKey: "s-1" });
    expect(result.json).toBe(true);
  });

  it("updates project metadata from inline JSON", async () => {
    const patchSpy = vi.fn().mockResolvedValue(makeProject({ id: "project-inline" }));
    await executeProjectUpdate(
      "project-inline",
      {
        apiBase: "http://localhost:3100",
        metadata: '{"routing":{"sessionKey":"sk-live"}}',
      },
      {
        resolveContext: () => ({
          api: { patch: patchSpy } as any,
          companyId: undefined,
          profileName: "default",
          profile: {} as any,
          json: false,
        }),
      },
    );

    expect(patchSpy).toHaveBeenCalledWith("/api/projects/project-inline", {
      metadata: { routing: { sessionKey: "sk-live" } },
    });
  });

  it("updates project metadata from @file", async () => {
    const filePath = createTempJsonFile('{"session":{"key":"from-file"}}');
    const patchSpy = vi.fn().mockResolvedValue(makeProject({ id: "project-file" }));
    await executeProjectUpdate(
      "project-file",
      {
        apiBase: "http://localhost:3100",
        metadata: `@${filePath}`,
      },
      {
        resolveContext: () => ({
          api: { patch: patchSpy } as any,
          companyId: undefined,
          profileName: "default",
          profile: {} as any,
          json: false,
        }),
      },
    );

    expect(patchSpy).toHaveBeenCalledWith("/api/projects/project-file", {
      metadata: { session: { key: "from-file" } },
    });
  });
});
