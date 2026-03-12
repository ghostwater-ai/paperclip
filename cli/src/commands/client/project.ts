import { Command } from "commander";
import type { Project } from "@paperclipai/shared";
import fs from "node:fs/promises";
import {
  addCommonClientOptions,
  formatInlineRecord,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
  type ResolvedClientContext,
} from "./common.js";

interface ProjectListOptions extends BaseClientOptions {
  companyId?: string;
}

interface ProjectUpdateOptions extends BaseClientOptions {
  metadata: string;
}

interface ProjectCommandDeps {
  resolveContext?: (options: BaseClientOptions, opts?: { requireCompany?: boolean }) => ResolvedClientContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function parseProjectMetadataFlag(rawValue: string | undefined): Promise<Record<string, unknown> | null> {
  if (rawValue === undefined) {
    throw new Error("--metadata is required.");
  }

  const trimmed = rawValue.trim();
  const fromPath = trimmed.startsWith("@");
  const sourceHint = fromPath ? trimmed.slice(1).trim() : undefined;
  if (fromPath && !sourceHint) {
    throw new Error("Invalid --metadata value: missing file path after '@'.");
  }

  const source = fromPath
    ? await fs.readFile(sourceHint as string, { encoding: "utf8" }).catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read --metadata file '${sourceHint}': ${reason}`);
      })
    : rawValue;

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON for --metadata: ${reason}`);
  }

  if (parsed !== null && !isRecord(parsed)) {
    throw new Error("Invalid JSON for --metadata: expected a JSON object or null.");
  }

  return parsed;
}

export async function executeProjectList(
  opts: ProjectListOptions,
  deps: ProjectCommandDeps = {},
): Promise<{ rows: Project[]; json: boolean }> {
  const resolveContext = deps.resolveContext ?? resolveCommandContext;
  const ctx = resolveContext(opts, { requireCompany: true });
  const rows = (await ctx.api.get<Project[]>(`/api/companies/${ctx.companyId}/projects`)) ?? [];
  return { rows, json: ctx.json };
}

export async function executeProjectGet(
  projectId: string,
  opts: BaseClientOptions,
  deps: ProjectCommandDeps = {},
): Promise<{ row: Project; json: boolean }> {
  const resolveContext = deps.resolveContext ?? resolveCommandContext;
  const ctx = resolveContext(opts);
  const row = await ctx.api.get<Project>(`/api/projects/${projectId}`);
  if (!row) {
    throw new Error("Get project request returned no data");
  }
  return { row, json: ctx.json };
}

export async function executeProjectUpdate(
  projectId: string,
  opts: ProjectUpdateOptions,
  deps: ProjectCommandDeps = {},
): Promise<{ row: Project; json: boolean }> {
  const resolveContext = deps.resolveContext ?? resolveCommandContext;
  const ctx = resolveContext(opts);
  const metadata = await parseProjectMetadataFlag(opts.metadata);
  const row = await ctx.api.patch<Project>(`/api/projects/${projectId}`, { metadata });
  if (!row) {
    throw new Error("Update project request returned no data");
  }
  return { row, json: ctx.json };
}

export function registerProjectCommands(program: Command): void {
  const project = program.command("project").description("Project operations");

  addCommonClientOptions(
    project
      .command("list")
      .description("List projects for a company")
      .requiredOption("-C, --company-id <id>", "Company ID")
      .action(async (opts: ProjectListOptions) => {
        try {
          const { rows, json } = await executeProjectList(opts);
          if (json) {
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
                status: row.status,
                leadAgentId: row.leadAgentId,
                targetDate: row.targetDate,
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
    project
      .command("get")
      .description("Get one project")
      .argument("<id>", "Project ID")
      .action(async (projectId: string, opts: BaseClientOptions) => {
        try {
          const { row, json } = await executeProjectGet(projectId, opts);
          printOutput(row, { json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addCommonClientOptions(
    project
      .command("update")
      .description("Update project metadata")
      .argument("<id>", "Project ID")
      .requiredOption("--metadata <jsonOrFile>", "Project metadata JSON object/null or @path/to/file.json")
      .action(async (projectId: string, opts: ProjectUpdateOptions) => {
        try {
          const { row, json } = await executeProjectUpdate(projectId, opts);
          if (json) {
            printOutput(row, { json: true });
            return;
          }

          console.log(
            formatInlineRecord({
              id: row.id,
              name: row.name,
              status: row.status,
            }),
          );
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}
