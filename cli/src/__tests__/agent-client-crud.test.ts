import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildAgentCreatePayload,
  buildAgentUpdatePayload,
  executeAgentDelete,
  parseJsonConfigFlag,
} from "../commands/client/agent.js";

function createTempJsonFile(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-agent-cli-"));
  const filePath = path.join(dir, "config.json");
  fs.writeFileSync(filePath, contents, "utf8");
  return filePath;
}

describe("parseJsonConfigFlag", () => {
  it("parses inline JSON object", async () => {
    await expect(parseJsonConfigFlag('{"token":"abc"}', "--adapter-config")).resolves.toEqual({
      token: "abc",
    });
  });

  it("parses JSON object from @filepath", async () => {
    const filePath = createTempJsonFile('{"timeoutMs":5000}');
    await expect(parseJsonConfigFlag(`@${filePath}`, "--runtime-config")).resolves.toEqual({
      timeoutMs: 5000,
    });
  });

  it("throws deterministic error for invalid inline JSON", async () => {
    await expect(parseJsonConfigFlag('{"broken"', "--adapter-config"))
      .rejects.toThrow(/Invalid JSON for --adapter-config/);
  });

  it("throws deterministic error for unreadable @filepath", async () => {
    const missingPath = path.join(os.tmpdir(), `missing-${Date.now()}.json`);
    await expect(parseJsonConfigFlag(`@${missingPath}`, "--runtime-config"))
      .rejects.toThrow(`Failed to read --runtime-config file '${missingPath}'`);
  });

  it("throws when JSON is not an object", async () => {
    await expect(parseJsonConfigFlag("[1,2,3]", "--adapter-config"))
      .rejects.toThrow(/expected a JSON object/);
  });
});

describe("agent payload builders", () => {
  it("builds create payload with optional fields and parsed config", async () => {
    const payload = await buildAgentCreatePayload({
      companyId: "company-1",
      name: "Builder",
      adapterType: "process",
      role: "engineer",
      title: "Senior Engineer",
      reportsTo: "agent-manager",
      adapterConfig: '{"env":{"FOO":"bar"}}',
      runtimeConfig: '{"maxLoops":3}',
      budget: "15000",
    });

    expect(payload).toEqual({
      name: "Builder",
      adapterType: "process",
      role: "engineer",
      title: "Senior Engineer",
      reportsTo: "agent-manager",
      adapterConfig: { env: { FOO: "bar" } },
      runtimeConfig: { maxLoops: 3 },
      budgetMonthlyCents: 15000,
    });
  });

  it("builds update payload with only provided fields", async () => {
    const payload = await buildAgentUpdatePayload({
      name: "Renamed",
      adapterType: "http",
      budget: "42",
    });

    expect(payload).toEqual({
      name: "Renamed",
      adapterType: "http",
      budgetMonthlyCents: 42,
    });
  });

  it("rejects invalid adapter type for create", async () => {
    await expect(
      buildAgentCreatePayload({
        companyId: "company-1",
        name: "Bad Adapter",
        adapterType: "ssh",
      }),
    ).rejects.toThrow(/Invalid --adapter-type/);
  });

  it("rejects invalid role for update", async () => {
    await expect(
      buildAgentUpdatePayload({
        role: "intern",
      }),
    ).rejects.toThrow(/Invalid --role/);
  });
});

describe("executeAgentDelete", () => {
  it("does not call delete when confirmation is declined", async () => {
    const deleteSpy = vi.fn().mockResolvedValue(null);
    const confirmDelete = vi.fn().mockResolvedValue(false);

    const result = await executeAgentDelete(
      "agent-123",
      { apiBase: "http://localhost:3100" },
      {
        resolveContext: () => ({
          api: { delete: deleteSpy } as any,
          companyId: undefined,
          profileName: "default",
          profile: {} as any,
          json: false,
        }),
        confirmDelete,
      },
    );

    expect(confirmDelete).toHaveBeenCalledWith("agent-123");
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      deleted: false,
      payload: {
        ok: false,
        cancelled: true,
        deletedAgentId: "agent-123",
      },
      json: false,
    });
  });

  it("calls delete when confirmation is accepted", async () => {
    const deleteSpy = vi.fn().mockResolvedValue(null);
    const confirmDelete = vi.fn().mockResolvedValue(true);

    const result = await executeAgentDelete(
      "agent-456",
      { apiBase: "http://localhost:3100" },
      {
        resolveContext: () => ({
          api: { delete: deleteSpy } as any,
          companyId: undefined,
          profileName: "default",
          profile: {} as any,
          json: true,
        }),
        confirmDelete,
      },
    );

    expect(confirmDelete).toHaveBeenCalledWith("agent-456");
    expect(deleteSpy).toHaveBeenCalledWith("/api/agents/agent-456");
    expect(result).toEqual({
      deleted: true,
      payload: {
        ok: true,
        deletedAgentId: "agent-456",
      },
      json: true,
    });
  });

  it("skips prompt and calls delete when --yes is passed", async () => {
    const deleteSpy = vi.fn().mockResolvedValue(null);
    const confirmDelete = vi.fn().mockResolvedValue(false);

    const result = await executeAgentDelete(
      "agent-789",
      {
        apiBase: "http://localhost:3100",
        yes: true,
      },
      {
        resolveContext: () => ({
          api: { delete: deleteSpy } as any,
          companyId: undefined,
          profileName: "default",
          profile: {} as any,
          json: false,
        }),
        confirmDelete,
      },
    );

    expect(confirmDelete).not.toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledWith("/api/agents/agent-789");
    expect(result.payload).toEqual({
      ok: true,
      deletedAgentId: "agent-789",
    });
  });
});
