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

describe("project schedules migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not expose legacy project schedules endpoint", async () => {
    mockProjectService.getById.mockResolvedValue({ id: "project-1", companyId: "company-1" });

    const res = await request(createApp()).get("/api/projects/project-1/schedules");

    expect(res.status).toBe(404);
    expect(mockIssueService.listSchedulesForProject).not.toHaveBeenCalled();
  });
});
