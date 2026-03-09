import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAgentCreatePayload,
  buildAgentUpdatePayload,
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
