import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Issue, Agent } from "@paperclipai/shared";
import { SchedulesList } from "./SchedulesList";
import { MemoryRouter } from "react-router-dom";

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-1", companyPrefix: "acme" }),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../api/issues", () => ({
  issuesApi: {
    update: vi.fn(),
    create: vi.fn(),
  },
}));

// Mock the Avatar component to avoid window errors in tests
vi.mock("./ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: ({ src }: { src?: string }) => src ? <img src={src} /> : null,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function buildAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    companyId: "company-1",
    name: "Test Agent",
    urlKey: "test-agent",
    role: "engineer",
    title: null,
    icon: null,
    status: "active",
    reportsTo: null,
    capabilities: null,
    adapterType: "claude_local",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: {
      canCreateAgents: false,
    },
    lastHeartbeatAt: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Agent;
}

function buildSchedule(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    companyId: "company-1",
    projectId: "project-1",
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    title: "Weekly Standup",
    description: "Team sync meeting",
    status: "todo",
    priority: "medium",
    assigneeAgentId: "agent-1",
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
    schedule: "0 9 * * MON",
    scheduleTimezone: "America/New_York",
    scheduleNextRunAt: new Date("2026-03-24T09:00:00.000Z"),
    scheduleEnabled: true,
    isTemplate: true,
    assigneeAdapterOverrides: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
    updatedAt: new Date("2026-03-10T00:00:00.000Z"),
    ...overrides,
  } as Issue;
}

describe("SchedulesList", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  it("renders empty state when no schedules", () => {
    let component: TestRenderer.ReactTestRenderer;

    act(() => {
      component = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SchedulesList
              schedules={[]}
              isLoading={false}
              error={null}
              projectId="project-1"
              companyId="company-1"
              agents={[]}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    const tree = component!.toJSON();
    expect(tree).toBeTruthy();

    const text = JSON.stringify(tree);
    expect(text).toContain("No scheduled tasks yet");
    expect(text).toContain("Create Scheduled Task");
  });

  it("renders loading state", () => {
    let component: TestRenderer.ReactTestRenderer;

    act(() => {
      component = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SchedulesList
              schedules={[]}
              isLoading={true}
              error={null}
              projectId="project-1"
              companyId="company-1"
              agents={[]}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    const tree = component!.toJSON();
    expect(tree).toBeTruthy();

    const text = JSON.stringify(tree);
    expect(text).toContain("Loading schedules...");
  });

  it("renders error state", () => {
    let component: TestRenderer.ReactTestRenderer;
    const error = new Error("Failed to load schedules");

    act(() => {
      component = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SchedulesList
              schedules={[]}
              isLoading={false}
              error={error}
              projectId="project-1"
              companyId="company-1"
              agents={[]}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    const tree = component!.toJSON();
    expect(tree).toBeTruthy();

    const text = JSON.stringify(tree);
    expect(text).toContain("Error loading schedules");
    expect(text).toContain("Failed to load schedules");
  });

  it("renders schedule list with schedules", () => {
    const schedules = [
      buildSchedule({
        id: "schedule-1",
        title: "Weekly Standup",
        schedule: "0 9 * * MON",
        scheduleEnabled: true,
      }),
      buildSchedule({
        id: "schedule-2",
        title: "Monthly Review",
        schedule: "0 10 1 * *",
        scheduleEnabled: false,
        assigneeAgentId: "agent-2",
      }),
    ];

    const agents = [
      buildAgent({ id: "agent-1", name: "Agent One" }),
      buildAgent({ id: "agent-2", name: "Agent Two", icon: "https://example.com/avatar.png" }),
    ];

    let component: TestRenderer.ReactTestRenderer;

    act(() => {
      component = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SchedulesList
              schedules={schedules}
              isLoading={false}
              error={null}
              projectId="project-1"
              companyId="company-1"
              agents={agents}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    const tree = component!.toJSON();
    expect(tree).toBeTruthy();

    const text = JSON.stringify(tree);
    expect(text).toContain("Weekly Standup");
    expect(text).toContain("Monthly Review");
    expect(text).toContain("Agent One");
    expect(text).toContain("Agent Two");
    expect(text).toContain("0 9 * * MON");
    expect(text).toContain("0 10 1 * *");
  });

  it("renders enabled/disabled toggle correctly", () => {
    const schedules = [
      buildSchedule({
        id: "schedule-1",
        title: "Enabled Schedule",
        scheduleEnabled: true,
      }),
      buildSchedule({
        id: "schedule-2",
        title: "Disabled Schedule",
        scheduleEnabled: false,
      }),
    ];

    let component: TestRenderer.ReactTestRenderer;

    act(() => {
      component = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <SchedulesList
              schedules={schedules}
              isLoading={false}
              error={null}
              projectId="project-1"
              companyId="company-1"
              agents={[]}
            />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    const tree = component!.toJSON();
    expect(tree).toBeTruthy();

    // Find toggle buttons
    const findButtons = (node: any): any[] => {
      if (!node) return [];
      if (node.type === 'button' && node.props?.['aria-label']) {
        return [node];
      }
      if (node.children) {
        return node.children.flatMap(findButtons);
      }
      return [];
    };

    const buttons = findButtons(tree);
    const toggleButtons = buttons.filter(b =>
      b.props['aria-label'] === 'Disable schedule' ||
      b.props['aria-label'] === 'Enable schedule'
    );

    expect(toggleButtons).toHaveLength(2);
    expect(toggleButtons[0].props['aria-label']).toBe('Disable schedule');
    expect(toggleButtons[1].props['aria-label']).toBe('Enable schedule');
  });
});