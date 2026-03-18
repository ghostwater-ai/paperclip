import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach, Mock } from "vitest";
import type { Project, Issue } from "@paperclipai/shared";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProjectDetail } from "./ProjectDetail";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { budgetsApi } from "../api/budgets";
import { heartbeatsApi } from "../api/heartbeats";

vi.mock("../api/projects", () => ({
  projectsApi: {
    get: vi.fn(),
    listSchedules: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../api/issues", () => ({
  issuesApi: {
    list: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../api/agents", () => ({
  agentsApi: {
    list: vi.fn(),
  },
}));

vi.mock("../api/budgets", () => ({
  budgetsApi: {
    overview: vi.fn(),
  },
}));

vi.mock("../api/heartbeats", () => ({
  heartbeatsApi: {
    liveRunsForCompany: vi.fn(),
  },
}));

vi.mock("../api/assets", () => ({
  assetsApi: {
    upload: vi.fn(),
  },
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompanyId: "company-1",
    companyPrefix: "acme",
    companies: [{ id: "company-1", urlKey: "acme" }],
    selectCompany: vi.fn(),
  }),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../context/PanelContext", () => ({
  usePanel: () => ({ closePanel: vi.fn() }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({
    setBreadcrumbs: vi.fn(),
  }),
}));

vi.mock("../plugins/slots", () => ({
  usePluginSlots: () => ({ slots: [], isLoading: false }),
  PluginSlotOutlet: () => null,
  PluginSlotMount: () => null,
}));

vi.mock("../plugins/launchers", () => ({
  PluginLauncherOutlet: () => null,
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
    color: "#6366f1",
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

function buildIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    companyId: "company-1",
    projectId: "project-1",
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    title: "Test Issue",
    description: null,
    status: "todo",
    priority: "medium",
    assigneeAgentId: null,
    assigneeUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    issueNumber: null,
    identifier: null,
    requestDepth: 0,
    billingCode: null,
    schedule: null,
    scheduleTimezone: null,
    scheduleNextRunAt: null,
    scheduleEnabled: false,
    isTemplate: false,
    assigneeAdapterOverrides: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Issue;
}

describe("ProjectDetail - Schedules Tab", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.clearAllMocks();
  });

  it("renders schedules tab", async () => {
    (projectsApi.get as Mock).mockResolvedValue(buildProject());
    (projectsApi.listSchedules as Mock).mockResolvedValue([]);
    (issuesApi.list as Mock).mockResolvedValue([]);
    (agentsApi.list as Mock).mockResolvedValue([]);
    (budgetsApi.overview as Mock).mockResolvedValue({
      companyId: "company-1",
      budgetMonthlyCents: 0,
      spentMonthlyCents: 0,
      activeIncidents: [],
      policies: []
    });
    (heartbeatsApi.liveRunsForCompany as Mock).mockResolvedValue([]);

    let component: TestRenderer.ReactTestRenderer;

    await act(async () => {
      component = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/projects/project-1/schedules"]}>
            <Routes>
              <Route path="/projects/:projectRef/*" element={<ProjectDetail />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    // Wait for queries to settle
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const tree = component!.toJSON();
    expect(tree).toBeTruthy();

    const text = JSON.stringify(tree);
    expect(text).toContain("Schedules");
    expect(text).toContain("Issues");
    expect(text).toContain("Overview");
    expect(text).toContain("Configuration");
    expect(text).toContain("Budget");
  });

  it("loads schedules when schedules tab is active", async () => {
    (projectsApi.get as Mock).mockResolvedValue(buildProject());
    (issuesApi.list as Mock).mockResolvedValue([]);
    (agentsApi.list as Mock).mockResolvedValue([]);
    (budgetsApi.overview as Mock).mockResolvedValue({
      companyId: "company-1",
      budgetMonthlyCents: 0,
      spentMonthlyCents: 0,
      activeIncidents: [],
      policies: []
    });
    (heartbeatsApi.liveRunsForCompany as Mock).mockResolvedValue([]);

    const schedules = [
      buildIssue({
        id: "schedule-1",
        title: "Weekly Review",
        schedule: "0 9 * * MON",
        scheduleEnabled: true,
        isTemplate: true,
      }),
    ];

    (projectsApi.listSchedules as Mock).mockResolvedValue(schedules);

    let component: TestRenderer.ReactTestRenderer;

    await act(async () => {
      component = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/projects/project-1/schedules"]}>
            <Routes>
              <Route path="/projects/:projectRef/*" element={<ProjectDetail />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    // Wait for queries to settle
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(projectsApi.listSchedules).toHaveBeenCalledWith("project-1", "company-1");
  });

  it("filters out template issues from issues tab", async () => {
    (projectsApi.get as Mock).mockResolvedValue(buildProject());
    (projectsApi.listSchedules as Mock).mockResolvedValue([]);
    (agentsApi.list as Mock).mockResolvedValue([]);
    (budgetsApi.overview as Mock).mockResolvedValue({
      companyId: "company-1",
      budgetMonthlyCents: 0,
      spentMonthlyCents: 0,
      activeIncidents: [],
      policies: []
    });
    (heartbeatsApi.liveRunsForCompany as Mock).mockResolvedValue([]);

    const issues = [
      buildIssue({ id: "issue-1", title: "Regular Issue", isTemplate: false }),
      buildIssue({ id: "issue-2", title: "Template Issue", isTemplate: true, schedule: "0 9 * * *" }),
      buildIssue({ id: "issue-3", title: "Another Regular Issue", isTemplate: false }),
    ];

    (issuesApi.list as Mock).mockResolvedValue(issues);

    let component: TestRenderer.ReactTestRenderer;

    await act(async () => {
      component = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/projects/project-1/issues"]}>
            <Routes>
              <Route path="/projects/:projectRef/*" element={<ProjectDetail />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    // Wait for queries to settle
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const tree = component!.toJSON();
    const text = JSON.stringify(tree);

    // Should contain regular issues
    expect(text).toContain("Regular Issue");
    expect(text).toContain("Another Regular Issue");

    // Should NOT contain template issue
    expect(text).not.toContain("Template Issue");
  });
});