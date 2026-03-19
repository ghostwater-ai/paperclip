import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { issueRoutes } from "../routes/issues.js";

const mockIssueService = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
  update: vi.fn(),
  getByIdentifier: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  wakeup: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockProjectService = vi.hoisted(() => ({
  getById: vi.fn(),
  listByIds: vi.fn(),
}));

const mockGoalService = vi.hoisted(() => ({
  getById: vi.fn(),
  getDefaultCompanyGoal: vi.fn(),
}));

const mockIssueApprovalService = vi.hoisted(() => ({
  listApprovalsForIssue: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
}));

const mockExecutionWorkspaceService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockWorkProductService = vi.hoisted(() => ({
  listForIssue: vi.fn(),
}));

const mockDocumentService = vi.hoisted(() => ({
  getIssueDocumentPayload: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  issueService: () => mockIssueService,
  accessService: () => mockAccessService,
  heartbeatService: () => mockHeartbeatService,
  agentService: () => mockAgentService,
  projectService: () => mockProjectService,
  goalService: () => mockGoalService,
  issueApprovalService: () => mockIssueApprovalService,
  executionWorkspaceService: () => mockExecutionWorkspaceService,
  workProductService: () => mockWorkProductService,
  documentService: () => mockDocumentService,
  logActivity: mockLogActivity,
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      source: "session",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

describe("issue routes schedule payloads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockHeartbeatService.wakeup.mockResolvedValue({ id: "wake-1" });
  });

  it("accepts schedule fields on issue create", async () => {
    mockIssueService.create.mockResolvedValue({
      id: "issue-1",
      companyId: "company-1",
      title: "Scheduled task",
      status: "backlog",
      assigneeAgentId: null,
      identifier: "PAP-1",
      schedule: "*/10 * * * *",
      scheduleTimezone: "UTC",
      scheduleNextRunAt: "2026-03-18T10:10:00.000Z",
      scheduleEnabled: true,
      isTemplate: true,
    });

    const res = await request(createApp())
      .post("/api/companies/company-1/issues")
      .send({
        title: "Scheduled task",
        schedule: "*/10 * * * *",
        scheduleTimezone: "UTC",
      });

    expect(res.status).toBe(201);
    expect(mockIssueService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        title: "Scheduled task",
        schedule: "*/10 * * * *",
        scheduleTimezone: "UTC",
      }),
    );
    expect(res.body.isTemplate).toBe(true);
  });

  it("accepts schedule edits on issue patch", async () => {
    mockIssueService.getById.mockResolvedValue({
      id: "issue-1",
      companyId: "company-1",
      assigneeAgentId: null,
      assigneeUserId: null,
      status: "todo",
      title: "Scheduled task",
    });
    mockIssueService.update.mockResolvedValue({
      id: "issue-1",
      companyId: "company-1",
      title: "Scheduled task",
      status: "todo",
      assigneeAgentId: null,
      assigneeUserId: null,
      identifier: "PAP-1",
      schedule: "2026-03-18T09:00:00.000Z",
      scheduleTimezone: "UTC",
      scheduleNextRunAt: null,
      scheduleEnabled: false,
      isTemplate: true,
    });

    const res = await request(createApp())
      .patch("/api/issues/issue-1")
      .send({
        schedule: "2026-03-18T09:00:00.000Z",
        scheduleTimezone: "UTC",
      });

    expect(res.status).toBe(200);
    expect(mockIssueService.update).toHaveBeenCalledWith(
      "issue-1",
      expect.objectContaining({
        schedule: "2026-03-18T09:00:00.000Z",
        scheduleTimezone: "UTC",
      }),
    );
    expect(res.body.scheduleEnabled).toBe(false);
  });
});
