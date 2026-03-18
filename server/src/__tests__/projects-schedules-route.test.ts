import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { projectRoutes } from "../routes/projects.js";

const mockProjectService = vi.hoisted(() => ({
  getById: vi.fn(),
  list: vi.fn(),
  resolveByReference: vi.fn(),
}));

const mockIssueService = vi.hoisted(() => ({
  listSchedulesForProject: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  projectService: () => mockProjectService,
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
}));

function createApp(companyIds: string[] = ["company-1"]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      companyIds,
      source: "session",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", projectRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("project schedules route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists schedule templates for a project", async () => {
    mockProjectService.getById.mockResolvedValue({ id: "project-1", companyId: "company-1" });
    mockIssueService.listSchedulesForProject.mockResolvedValue([{ id: "issue-template-1", isTemplate: true }]);

    const res = await request(createApp()).get("/api/projects/project-1/schedules");

    expect(res.status).toBe(200);
    expect(mockIssueService.listSchedulesForProject).toHaveBeenCalledWith("project-1", "company-1");
    expect(res.body).toEqual([{ id: "issue-template-1", isTemplate: true }]);
  });

  it("enforces company access", async () => {
    mockProjectService.getById.mockResolvedValue({ id: "project-2", companyId: "company-2" });

    const res = await request(createApp(["company-1"])).get("/api/projects/project-2/schedules");

    expect(res.status).toBe(403);
    expect(mockIssueService.listSchedulesForProject).not.toHaveBeenCalled();
  });
});
