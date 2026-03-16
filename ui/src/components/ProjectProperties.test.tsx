import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "@paperclipai/shared";
import { ProjectProperties, type ProjectConfigFieldKey } from "./ProjectProperties";
import { TooltipProvider } from "./ui/tooltip";

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: null }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function buildProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    companyId: "company-1",
    urlKey: "project-1",
    goalId: null,
    goalIds: [],
    goals: [],
    name: "Project Alpha",
    description: null,
    status: "backlog",
    leadAgentId: null,
    targetDate: null,
    color: null,
    metadata: null,
    pauseReason: null,
    pausedAt: null,
    executionWorkspacePolicy: null,
    codebase: {
      workspaceId: null,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
      repoName: null,
      localFolder: null,
      managedFolder: "",
      effectiveLocalFolder: "",
      origin: "local_folder",
    },
    workspaces: [],
    primaryWorkspace: null,
    archivedAt: null,
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
    updatedAt: new Date("2026-03-10T00:00:00.000Z"),
    ...overrides,
  };
}

function renderProjectProperties(props: {
  project?: Project;
  onFieldUpdate?: (field: ProjectConfigFieldKey, data: Record<string, unknown>) => void;
}) {
  const queryClient = new QueryClient();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <TooltipProvider>
        <QueryClientProvider client={queryClient}>
          <ProjectProperties
            project={props.project ?? buildProject()}
            onFieldUpdate={props.onFieldUpdate}
          />
        </QueryClientProvider>
      </TooltipProvider>,
    );
  });
  return tree;
}

describe("ProjectProperties metadata editor", () => {
  it("commits parsed metadata JSON object updates", () => {
    const onFieldUpdate = vi.fn();
    const tree = renderProjectProperties({
      onFieldUpdate,
      project: buildProject({
        metadata: {
          sessionKey: "alpha",
        },
      }),
    });

    const textarea = tree.root.findByProps({ placeholder: '{\n  "sessionKey": "project-session-1"\n}' });

    act(() => {
      textarea.props.onChange({
        target: { value: '{\n  "sessionKey": "beta",\n  "channel": "ops"\n}' },
      });
    });

    expect(onFieldUpdate).toHaveBeenCalledWith("metadata", {
      metadata: {
        sessionKey: "beta",
        channel: "ops",
      },
    });
  });

  it("shows a validation error for invalid metadata JSON", () => {
    const tree = renderProjectProperties({
      onFieldUpdate: vi.fn(),
      project: buildProject(),
    });

    const textarea = tree.root.findByProps({ placeholder: '{\n  "sessionKey": "project-session-1"\n}' });

    act(() => {
      textarea.props.onChange({
        target: { value: "{ invalid json" },
      });
    });

    const errors = tree.root.findAllByProps({ className: "text-xs text-destructive" });
    expect(errors.some((entry) => String(entry.children[0]).includes("Metadata must be valid JSON."))).toBe(true);
  });
});
