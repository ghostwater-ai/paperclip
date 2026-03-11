import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Project } from "@paperclipai/shared";
import { NewProjectDialog } from "../NewProjectDialog";
import { ProjectProperties } from "../ProjectProperties";

const mocks = vi.hoisted(() => ({
  closeNewProject: vi.fn(),
  projectsCreate: vi.fn(),
  projectsCreateWorkspace: vi.fn(),
  goalsList: vi.fn(),
  assetsUploadImage: vi.fn(),
}));

vi.mock("../../context/DialogContext", () => ({
  useDialog: () => ({
    newProjectOpen: true,
    closeNewProject: mocks.closeNewProject,
  }),
}));

vi.mock("../../context/CompanyContext", () => ({
  useCompany: () => ({
    selectedCompanyId: "company-1",
    selectedCompany: {
      id: "company-1",
      name: "Paperclip Co",
    },
  }),
}));

vi.mock("../../api/projects", () => ({
  projectsApi: {
    create: mocks.projectsCreate,
    createWorkspace: mocks.projectsCreateWorkspace,
  },
}));

vi.mock("../../api/goals", () => ({
  goalsApi: {
    list: mocks.goalsList,
  },
}));

vi.mock("../../api/assets", () => ({
  assetsApi: {
    uploadImage: mocks.assetsUploadImage,
  },
}));

function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {ui}
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function buildProject(overrides: Partial<Project> = {}): Project {
  return {
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
    sessionKey: "paperclip:existing",
    sessionKeyRouting: null,
    color: "#0ea5e9",
    workspaces: [],
    primaryWorkspace: null,
    archivedAt: null,
    createdAt: new Date("2026-03-11T00:00:00.000Z"),
    updatedAt: new Date("2026-03-11T00:00:00.000Z"),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Project session key routing UI", () => {
  it("submits sessionKeyRouting from New Project dialog while preserving sessionKey", async () => {
    mocks.goalsList.mockResolvedValue([]);
    mocks.projectsCreate.mockResolvedValue({ id: "project-123" });
    mocks.projectsCreateWorkspace.mockResolvedValue({});

    renderWithQuery(<NewProjectDialog />);

    fireEvent.change(screen.getByPlaceholderText("Project name"), {
      target: { value: "Session Routing Project" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. paperclip:my-project"), {
      target: { value: "paperclip:my-project" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(screen.getByLabelText("Routing pattern 1"), {
      target: { value: "automation:issue_*" },
    });
    fireEvent.change(screen.getByLabelText("Session key template 1"), {
      target: { value: "{{projectSessionKey}}" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(mocks.projectsCreate).toHaveBeenCalledTimes(1);
    });

    expect(mocks.projectsCreate).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        name: "Session Routing Project",
        sessionKey: "paperclip:my-project",
        sessionKeyRouting: [
          {
            pattern: "automation:issue_*",
            sessionKey: "{{projectSessionKey}}",
          },
        ],
      }),
    );
  });

  it("persists routing rule edits in Project Properties and keeps Session Key behavior", () => {
    mocks.goalsList.mockResolvedValue([]);
    const onUpdate = vi.fn();

    renderWithQuery(
      <ProjectProperties
        project={buildProject()}
        onUpdate={onUpdate}
      />,
    );

    const sessionKeyInput = screen.getByPlaceholderText("e.g. paperclip:my-project");
    fireEvent.change(sessionKeyInput, {
      target: { value: "paperclip:updated" },
    });
    fireEvent.blur(sessionKeyInput);

    expect(onUpdate).toHaveBeenCalledWith({ sessionKey: "paperclip:updated" });

    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(screen.getByLabelText("Routing pattern 1"), {
      target: { value: "assignment:*" },
    });
    fireEvent.change(screen.getByLabelText("Session key template 1"), {
      target: { value: "{{projectSessionKey}}" },
    });

    expect(onUpdate).toHaveBeenCalledWith({
      sessionKeyRouting: [
        {
          pattern: "assignment:*",
          sessionKey: "{{projectSessionKey}}",
        },
      ],
    });
  });
});
