import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach, Mock } from "vitest";
import type { Project } from "@paperclipai/shared";
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
    companies: [{ id: "company-1", urlKey: "acme", issuePrefix: "ACME" }],
    selectCompany: vi.fn(),
    setSelectedCompanyId: vi.fn(),
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

vi.mock("../context/SidebarContext", () => ({
  useSidebar: () => ({
    isCollapsed: false,
    toggleSidebar: vi.fn(),
  }),
}));

vi.mock("../context/DialogContext", () => ({
  useDialog: () => ({
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
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

// Mock browser APIs
(globalThis as any).requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
(globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
(globalThis as any).window = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
};

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

describe("ProjectDetail", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
        mutations: { retry: false },
      },
    });

    vi.clearAllMocks();
  });

  it("renders project tabs", async () => {
    const mockProject = buildProject();
    (projectsApi.get as Mock).mockResolvedValue(mockProject);
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
          <MemoryRouter initialEntries={["/projects/project-1/issues"]}>
            <Routes>
              <Route path="/projects/:projectId/*" element={<ProjectDetail />} />
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
    expect(text).toContain("Issues");
    expect(text).toContain("Overview");
    expect(text).toContain("Configuration");
    expect(text).toContain("Budget");
  });
});
