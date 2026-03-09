import { Command } from "commander";
import * as p from "@clack/prompts";
import { AGENT_ADAPTER_TYPES, AGENT_ROLES, type Agent } from "@paperclipai/shared";
import {
  removeMaintainerOnlySkillSymlinks,
  resolvePaperclipSkillsDir,
} from "@paperclipai/adapter-utils/server-utils";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addCommonClientOptions,
  formatInlineRecord,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
  type ResolvedClientContext,
} from "./common.js";

interface AgentListOptions extends BaseClientOptions {
  companyId?: string;
}

interface AgentCreateOptions extends BaseClientOptions {
  companyId?: string;
  name: string;
  adapterType: string;
  role?: string;
  title?: string;
  reportsTo?: string;
  adapterConfig?: string;
  runtimeConfig?: string;
  budget?: string;
}

interface AgentUpdateOptions extends BaseClientOptions {
  name?: string;
  role?: string;
  status?: string;
  adapterType?: string;
  adapterConfig?: string;
  runtimeConfig?: string;
  budget?: string;
  title?: string;
  reportsTo?: string;
}

interface AgentDeleteOptions extends BaseClientOptions {
  yes?: boolean;
}

interface AgentLocalCliOptions extends BaseClientOptions {
  companyId?: string;
  keyName?: string;
  installSkills?: boolean;
}

interface CreatedAgentKey {
  id: string;
  name: string;
  token: string;
  createdAt: string;
}

interface SkillsInstallSummary {
  tool: "codex" | "claude";
  target: string;
  linked: string[];
  removed: string[];
  skipped: string[];
  failed: Array<{ name: string; error: string }>;
}

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ADAPTER_TYPE_VALUES = [...AGENT_ADAPTER_TYPES] as readonly string[];
const AGENT_ROLE_VALUES = [...AGENT_ROLES] as readonly string[];

interface AgentMutationPayload {
  name?: string;
  role?: string;
  status?: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  runtimeConfig?: Record<string, unknown>;
  budgetMonthlyCents?: number;
  title?: string;
  reportsTo?: string;
}

interface AgentDeleteExecutionDeps {
  resolveContext?: (options: BaseClientOptions, opts?: { requireCompany?: boolean }) => ResolvedClientContext;
  confirmDelete?: (agentId: string) => Promise<boolean>;
}

interface AgentDeleteSuccessPayload {
  ok: true;
  deletedAgentId: string;
}

interface AgentDeleteCancelledPayload {
  ok: false;
  cancelled: true;
  deletedAgentId: string;
}

interface AgentDeleteExecutionResult {
  deleted: boolean;
  payload: AgentDeleteSuccessPayload | AgentDeleteCancelledPayload;
  json: boolean;
}

function omitUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}

function parseAgentBudget(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Invalid --budget value '${value}'. Expected a non-negative integer.`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid --budget value '${value}'. Expected a non-negative integer.`);
  }
  return parsed;
}

function parseEnumFlag(value: string | undefined, values: readonly string[], flagName: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!values.includes(normalized)) {
    throw new Error(`Invalid ${flagName} '${value}'. Allowed: ${values.join(", ")}`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function promptAgentDeleteConfirmation(agentId: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Confirmation requires an interactive terminal. Re-run with --yes to skip the prompt.");
  }

  const answer = await p.confirm({
    message: `Delete agent '${agentId}'? This action cannot be undone.`,
    initialValue: false,
  });

  if (p.isCancel(answer)) {
    return false;
  }

  return answer;
}

export async function executeAgentDelete(
  agentId: string,
  opts: AgentDeleteOptions,
  deps: AgentDeleteExecutionDeps = {},
): Promise<AgentDeleteExecutionResult> {
  const resolveContext = deps.resolveContext ?? resolveCommandContext;
  const confirmDelete = deps.confirmDelete ?? promptAgentDeleteConfirmation;
  const ctx = resolveContext(opts);

  let shouldDelete = Boolean(opts.yes);
  if (!shouldDelete) {
    shouldDelete = await confirmDelete(agentId);
  }

  if (!shouldDelete) {
    return {
      deleted: false,
      payload: {
        ok: false,
        cancelled: true,
        deletedAgentId: agentId,
      },
      json: ctx.json,
    };
  }

  await ctx.api.delete(`/api/agents/${agentId}`);

  return {
    deleted: true,
    payload: {
      ok: true,
      deletedAgentId: agentId,
    },
    json: ctx.json,
  };
}

export async function parseJsonConfigFlag(
  rawValue: string | undefined,
  flagName: "--adapter-config" | "--runtime-config",
): Promise<Record<string, unknown> | undefined> {
  if (rawValue === undefined) return undefined;

  const trimmed = rawValue.trim();
  const fromPath = trimmed.startsWith("@");
  const sourceHint = fromPath ? trimmed.slice(1).trim() : undefined;
  if (fromPath && !sourceHint) {
    throw new Error(`Invalid ${flagName} value: missing file path after '@'.`);
  }
  const filePath = sourceHint as string | undefined;
  const source = fromPath
    ? await fs.readFile(filePath!, { encoding: "utf8" }).catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read ${flagName} file '${filePath}': ${reason}`);
      })
    : rawValue;

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON for ${flagName}: ${reason}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Invalid JSON for ${flagName}: expected a JSON object.`);
  }

  return parsed;
}

export async function buildAgentCreatePayload(opts: AgentCreateOptions): Promise<Required<Pick<AgentMutationPayload, "name" | "adapterType">> & AgentMutationPayload> {
  return omitUndefined({
    name: opts.name,
    adapterType: parseEnumFlag(opts.adapterType, AGENT_ADAPTER_TYPE_VALUES, "--adapter-type")!,
    role: parseEnumFlag(opts.role, AGENT_ROLE_VALUES, "--role"),
    title: opts.title,
    reportsTo: opts.reportsTo,
    adapterConfig: await parseJsonConfigFlag(opts.adapterConfig, "--adapter-config"),
    runtimeConfig: await parseJsonConfigFlag(opts.runtimeConfig, "--runtime-config"),
    budgetMonthlyCents: parseAgentBudget(opts.budget),
  });
}

export async function buildAgentUpdatePayload(opts: AgentUpdateOptions): Promise<AgentMutationPayload> {
  return omitUndefined({
    name: opts.name,
    role: parseEnumFlag(opts.role, AGENT_ROLE_VALUES, "--role"),
    status: opts.status,
    adapterType: parseEnumFlag(opts.adapterType, AGENT_ADAPTER_TYPE_VALUES, "--adapter-type"),
    adapterConfig: await parseJsonConfigFlag(opts.adapterConfig, "--adapter-config"),
    runtimeConfig: await parseJsonConfigFlag(opts.runtimeConfig, "--runtime-config"),
    budgetMonthlyCents: parseAgentBudget(opts.budget),
    title: opts.title,
    reportsTo: opts.reportsTo,
  });
}

function codexSkillsHome(): string {
  const fromEnv = process.env.CODEX_HOME?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : path.join(os.homedir(), ".codex");
  return path.join(base, "skills");
}

function claudeSkillsHome(): string {
  const fromEnv = process.env.CLAUDE_HOME?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : path.join(os.homedir(), ".claude");
  return path.join(base, "skills");
}

async function installSkillsForTarget(
  sourceSkillsDir: string,
  targetSkillsDir: string,
  tool: "codex" | "claude",
): Promise<SkillsInstallSummary> {
  const summary: SkillsInstallSummary = {
    tool,
    target: targetSkillsDir,
    linked: [],
    removed: [],
    skipped: [],
    failed: [],
  };

  await fs.mkdir(targetSkillsDir, { recursive: true });
  const entries = await fs.readdir(sourceSkillsDir, { withFileTypes: true });
  summary.removed = await removeMaintainerOnlySkillSymlinks(
    targetSkillsDir,
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  );
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const source = path.join(sourceSkillsDir, entry.name);
    const target = path.join(targetSkillsDir, entry.name);
    const existing = await fs.lstat(target).catch(() => null);
    if (existing) {
      if (existing.isSymbolicLink()) {
        let linkedPath: string | null = null;
        try {
          linkedPath = await fs.readlink(target);
        } catch (err) {
          await fs.unlink(target);
          try {
            await fs.symlink(source, target);
            summary.linked.push(entry.name);
            continue;
          } catch (linkErr) {
            summary.failed.push({
              name: entry.name,
              error:
                err instanceof Error && linkErr instanceof Error
                  ? `${err.message}; then ${linkErr.message}`
                  : err instanceof Error
                    ? err.message
                    : `Failed to recover broken symlink: ${String(err)}`,
            });
            continue;
          }
        }

        const resolvedLinkedPath = path.isAbsolute(linkedPath)
          ? linkedPath
          : path.resolve(path.dirname(target), linkedPath);
        const linkedTargetExists = await fs
          .stat(resolvedLinkedPath)
          .then(() => true)
          .catch(() => false);

        if (!linkedTargetExists) {
          await fs.unlink(target);
        } else {
          summary.skipped.push(entry.name);
          continue;
        }
      } else {
        summary.skipped.push(entry.name);
        continue;
      }
    }

    try {
      await fs.symlink(source, target);
      summary.linked.push(entry.name);
    } catch (err) {
      summary.failed.push({
        name: entry.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

function buildAgentEnvExports(input: {
  apiBase: string;
  companyId: string;
  agentId: string;
  apiKey: string;
}): string {
  const escaped = (value: string) => value.replace(/'/g, "'\"'\"'");
  return [
    `export PAPERCLIP_API_URL='${escaped(input.apiBase)}'`,
    `export PAPERCLIP_COMPANY_ID='${escaped(input.companyId)}'`,
    `export PAPERCLIP_AGENT_ID='${escaped(input.agentId)}'`,
    `export PAPERCLIP_API_KEY='${escaped(input.apiKey)}'`,
  ].join("\n");
}

export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description("Agent operations");

  addCommonClientOptions(
    agent
      .command("create")
      .description("Create an agent")
      .requiredOption("-C, --company-id <id>", "Company ID")
      .requiredOption("--name <name>", "Agent name")
      .requiredOption(
        "--adapter-type <type>",
        `Adapter type (${AGENT_ADAPTER_TYPE_VALUES.join(", ")})`,
      )
      .option("--role <role>", `Agent role (${AGENT_ROLE_VALUES.join(", ")})`)
      .option("--title <title>", "Agent title")
      .option("--reports-to <agentId>", "Manager agent ID")
      .option("--adapter-config <jsonOrFile>", "Adapter config JSON or @path/to/file.json")
      .option("--runtime-config <jsonOrFile>", "Runtime config JSON or @path/to/file.json")
      .option("--budget <cents>", "Monthly budget in cents (integer)")
      .action(async (opts: AgentCreateOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const payload = await buildAgentCreatePayload(opts);
          const created = await ctx.api.post<Agent>(`/api/companies/${ctx.companyId}/agents`, payload);
          if (!created) {
            throw new Error("Create agent request returned no data");
          }

          if (ctx.json) {
            printOutput(created, { json: true });
            return;
          }

          console.log(
            formatInlineRecord({
              id: created.id,
              name: created.name,
              role: created.role,
              status: created.status,
              title: created.title,
              reportsTo: created.reportsTo,
              adapterType: created.adapterType,
              budgetMonthlyCents: created.budgetMonthlyCents,
            }),
          );
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    agent
      .command("update")
      .description("Update an agent")
      .argument("<agentId>", "Agent ID")
      .option("--name <name>", "Agent name")
      .option("--role <role>", `Agent role (${AGENT_ROLE_VALUES.join(", ")})`)
      .option("--status <status>", "Agent status")
      .option(
        "--adapter-type <type>",
        `Adapter type (${AGENT_ADAPTER_TYPE_VALUES.join(", ")})`,
      )
      .option("--adapter-config <jsonOrFile>", "Adapter config JSON or @path/to/file.json")
      .option("--runtime-config <jsonOrFile>", "Runtime config JSON or @path/to/file.json")
      .option("--budget <cents>", "Monthly budget in cents (integer)")
      .option("--title <title>", "Agent title")
      .option("--reports-to <agentId>", "Manager agent ID")
      .action(async (agentId: string, opts: AgentUpdateOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const payload = await buildAgentUpdatePayload(opts);
          const updated = await ctx.api.patch<Agent>(`/api/agents/${agentId}`, payload);
          if (!updated) {
            throw new Error("Update agent request returned no data");
          }

          if (ctx.json) {
            printOutput(updated, { json: true });
            return;
          }

          console.log(
            formatInlineRecord({
              id: updated.id,
              name: updated.name,
              role: updated.role,
              status: updated.status,
              title: updated.title,
              reportsTo: updated.reportsTo,
              adapterType: updated.adapterType,
              budgetMonthlyCents: updated.budgetMonthlyCents,
            }),
          );
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("delete")
      .description("Delete an agent (destructive)")
      .argument("<agentId>", "Agent ID")
      .option("-y, --yes", "Skip confirmation prompt", false)
      .action(async (agentId: string, opts: AgentDeleteOptions) => {
        try {
          const result = await executeAgentDelete(agentId, opts);

          if (result.json) {
            printOutput(result.payload, { json: true });
            return;
          }

          if (!result.deleted) {
            console.log(`Cancelled deletion for agent ${agentId}.`);
            return;
          }

          console.log(`Deleted agent ${agentId}.`);
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("list")
      .description("List agents for a company")
      .requiredOption("-C, --company-id <id>", "Company ID")
      .action(async (opts: AgentListOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const rows = (await ctx.api.get<Agent[]>(`/api/companies/${ctx.companyId}/agents`)) ?? [];

          if (ctx.json) {
            printOutput(rows, { json: true });
            return;
          }

          if (rows.length === 0) {
            printOutput([], { json: false });
            return;
          }

          for (const row of rows) {
            console.log(
              formatInlineRecord({
                id: row.id,
                name: row.name,
                role: row.role,
                status: row.status,
                reportsTo: row.reportsTo,
                budgetMonthlyCents: row.budgetMonthlyCents,
                spentMonthlyCents: row.spentMonthlyCents,
              }),
            );
          }
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );

  addCommonClientOptions(
    agent
      .command("get")
      .description("Get one agent")
      .argument("<agentId>", "Agent ID")
      .action(async (agentId: string, opts: BaseClientOptions) => {
        try {
          const ctx = resolveCommandContext(opts);
          const row = await ctx.api.get<Agent>(`/api/agents/${agentId}`);
          printOutput(row, { json: ctx.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    agent
      .command("local-cli")
      .description(
        "Create an agent API key, install local Paperclip skills for Codex/Claude, and print shell exports",
      )
      .argument("<agentRef>", "Agent ID or shortname/url-key")
      .requiredOption("-C, --company-id <id>", "Company ID")
      .option("--key-name <name>", "API key label", "local-cli")
      .option(
        "--no-install-skills",
        "Skip installing Paperclip skills into ~/.codex/skills and ~/.claude/skills",
      )
      .action(async (agentRef: string, opts: AgentLocalCliOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const query = new URLSearchParams({ companyId: ctx.companyId ?? "" });
          const agentRow = await ctx.api.get<Agent>(
            `/api/agents/${encodeURIComponent(agentRef)}?${query.toString()}`,
          );
          if (!agentRow) {
            throw new Error(`Agent not found: ${agentRef}`);
          }

          const now = new Date().toISOString().replaceAll(":", "-");
          const keyName = opts.keyName?.trim() ? opts.keyName.trim() : `local-cli-${now}`;
          const key = await ctx.api.post<CreatedAgentKey>(`/api/agents/${agentRow.id}/keys`, { name: keyName });
          if (!key) {
            throw new Error("Failed to create API key");
          }

          const installSummaries: SkillsInstallSummary[] = [];
          if (opts.installSkills !== false) {
            const skillsDir = await resolvePaperclipSkillsDir(__moduleDir, [path.resolve(process.cwd(), "skills")]);
            if (!skillsDir) {
              throw new Error(
                "Could not locate local Paperclip skills directory. Expected ./skills in the repo checkout.",
              );
            }

            installSummaries.push(
              await installSkillsForTarget(skillsDir, codexSkillsHome(), "codex"),
              await installSkillsForTarget(skillsDir, claudeSkillsHome(), "claude"),
            );
          }

          const exportsText = buildAgentEnvExports({
            apiBase: ctx.api.apiBase,
            companyId: agentRow.companyId,
            agentId: agentRow.id,
            apiKey: key.token,
          });

          if (ctx.json) {
            printOutput(
              {
                agent: {
                  id: agentRow.id,
                  name: agentRow.name,
                  urlKey: agentRow.urlKey,
                  companyId: agentRow.companyId,
                },
                key: {
                  id: key.id,
                  name: key.name,
                  createdAt: key.createdAt,
                  token: key.token,
                },
                skills: installSummaries,
                exports: exportsText,
              },
              { json: true },
            );
            return;
          }

          console.log(`Agent: ${agentRow.name} (${agentRow.id})`);
          console.log(`API key created: ${key.name} (${key.id})`);
          if (installSummaries.length > 0) {
            for (const summary of installSummaries) {
              console.log(
                `${summary.tool}: linked=${summary.linked.length} removed=${summary.removed.length} skipped=${summary.skipped.length} failed=${summary.failed.length} target=${summary.target}`,
              );
              for (const failed of summary.failed) {
                console.log(`  failed ${failed.name}: ${failed.error}`);
              }
            }
          }
          console.log("");
          console.log("# Run this in your shell before launching codex/claude:");
          console.log(exportsText);
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: false },
  );
}
