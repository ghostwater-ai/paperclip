import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { execute, testEnvironment } from "@paperclipai/adapter-openclaw-gateway/server";
import {
  interpolateTemplate,
  matchPattern,
  resolveDotPath,
  resolveSessionKeyFromRouting,
} from "../../../packages/adapters/openclaw-gateway/src/server/execute";
import {
  buildOpenClawGatewayConfig,
  parseOpenClawGatewayStdoutLine,
} from "@paperclipai/adapter-openclaw-gateway/ui";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";

function buildContext(
  config: Record<string, unknown>,
  overrides?: Partial<AdapterExecutionContext>,
): AdapterExecutionContext {
  return {
    runId: "run-123",
    agent: {
      id: "agent-123",
      companyId: "company-123",
      name: "OpenClaw Gateway Agent",
      adapterType: "openclaw_gateway",
      adapterConfig: {},
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    config,
    context: {
      taskId: "task-123",
      issueId: "issue-123",
      wakeReason: "issue_assigned",
      issueIds: ["issue-123"],
    },
    onLog: async () => {},
    ...overrides,
  };
}

async function createMockGatewayServer(options?: {
  waitPayload?: Record<string, unknown>;
}) {
  const server = createServer();
  const wss = new WebSocketServer({ server });

  let agentPayload: Record<string, unknown> | null = null;

  wss.on("connection", (socket) => {
    socket.send(
      JSON.stringify({
        type: "event",
        event: "connect.challenge",
        payload: { nonce: "nonce-123" },
      }),
    );

    socket.on("message", (raw) => {
      const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
      const frame = JSON.parse(text) as {
        type: string;
        id: string;
        method: string;
        params?: Record<string, unknown>;
      };

      if (frame.type !== "req") return;

      if (frame.method === "connect") {
        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              type: "hello-ok",
              protocol: 3,
              server: { version: "test", connId: "conn-1" },
              features: { methods: ["connect", "agent", "agent.wait"], events: ["agent"] },
              snapshot: { version: 1, ts: Date.now() },
              policy: { maxPayload: 1_000_000, maxBufferedBytes: 1_000_000, tickIntervalMs: 30_000 },
            },
          }),
        );
        return;
      }

      if (frame.method === "agent") {
        agentPayload = frame.params ?? null;
        const runId =
          typeof frame.params?.idempotencyKey === "string"
            ? frame.params.idempotencyKey
            : "run-123";

        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              runId,
              status: "accepted",
              acceptedAt: Date.now(),
            },
          }),
        );

        socket.send(
          JSON.stringify({
            type: "event",
            event: "agent",
            payload: {
              runId,
              seq: 1,
              stream: "assistant",
              ts: Date.now(),
              data: { delta: "cha" },
            },
          }),
        );
        socket.send(
          JSON.stringify({
            type: "event",
            event: "agent",
            payload: {
              runId,
              seq: 2,
              stream: "assistant",
              ts: Date.now(),
              data: { delta: "chacha" },
            },
          }),
        );
        return;
      }

      if (frame.method === "agent.wait") {
        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: options?.waitPayload ?? {
              runId: frame.params?.runId,
              status: "ok",
              startedAt: 1,
              endedAt: 2,
            },
          }),
        );
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve test server address");
  }

  return {
    url: `ws://127.0.0.1:${address.port}`,
    getAgentPayload: () => agentPayload,
    close: async () => {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function createMockGatewayServerWithPairing() {
  const server = createServer();
  const wss = new WebSocketServer({ server });

  let agentPayload: Record<string, unknown> | null = null;
  let approved = false;
  let pendingRequestId = "req-1";
  let lastSeenDeviceId: string | null = null;

  wss.on("connection", (socket) => {
    socket.send(
      JSON.stringify({
        type: "event",
        event: "connect.challenge",
        payload: { nonce: "nonce-123" },
      }),
    );

    socket.on("message", (raw) => {
      const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
      const frame = JSON.parse(text) as {
        type: string;
        id: string;
        method: string;
        params?: Record<string, unknown>;
      };

      if (frame.type !== "req") return;

      if (frame.method === "connect") {
        const device = frame.params?.device as Record<string, unknown> | undefined;
        const deviceId = typeof device?.id === "string" ? device.id : null;
        if (deviceId) {
          lastSeenDeviceId = deviceId;
        }

        if (deviceId && !approved) {
          socket.send(
            JSON.stringify({
              type: "res",
              id: frame.id,
              ok: false,
              error: {
                code: "NOT_PAIRED",
                message: "pairing required",
                details: {
                  code: "PAIRING_REQUIRED",
                  requestId: pendingRequestId,
                  reason: "not-paired",
                },
              },
            }),
          );
          socket.close(1008, "pairing required");
          return;
        }

        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              type: "hello-ok",
              protocol: 3,
              server: { version: "test", connId: "conn-1" },
              features: {
                methods: ["connect", "agent", "agent.wait", "device.pair.list", "device.pair.approve"],
                events: ["agent"],
              },
              snapshot: { version: 1, ts: Date.now() },
              policy: { maxPayload: 1_000_000, maxBufferedBytes: 1_000_000, tickIntervalMs: 30_000 },
            },
          }),
        );
        return;
      }

      if (frame.method === "device.pair.list") {
        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              pending: approved
                ? []
                : [
                    {
                      requestId: pendingRequestId,
                      deviceId: lastSeenDeviceId ?? "device-unknown",
                    },
                  ],
              paired: approved && lastSeenDeviceId ? [{ deviceId: lastSeenDeviceId }] : [],
            },
          }),
        );
        return;
      }

      if (frame.method === "device.pair.approve") {
        const requestId = frame.params?.requestId;
        if (requestId !== pendingRequestId) {
          socket.send(
            JSON.stringify({
              type: "res",
              id: frame.id,
              ok: false,
              error: { code: "INVALID_REQUEST", message: "unknown requestId" },
            }),
          );
          return;
        }
        approved = true;
        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              requestId: pendingRequestId,
              device: {
                deviceId: lastSeenDeviceId ?? "device-unknown",
              },
            },
          }),
        );
        return;
      }

      if (frame.method === "agent") {
        agentPayload = frame.params ?? null;
        const runId =
          typeof frame.params?.idempotencyKey === "string"
            ? frame.params.idempotencyKey
            : "run-123";

        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              runId,
              status: "accepted",
              acceptedAt: Date.now(),
            },
          }),
        );
        socket.send(
          JSON.stringify({
            type: "event",
            event: "agent",
            payload: {
              runId,
              seq: 1,
              stream: "assistant",
              ts: Date.now(),
              data: { delta: "ok" },
            },
          }),
        );
        return;
      }

      if (frame.method === "agent.wait") {
        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              runId: frame.params?.runId,
              status: "ok",
              startedAt: 1,
              endedAt: 2,
            },
          }),
        );
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve test server address");
  }

  return {
    url: `ws://127.0.0.1:${address.port}`,
    getAgentPayload: () => agentPayload,
    close: async () => {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

afterEach(() => {
  // no global mocks
});

describe("openclaw gateway ui stdout parser", () => {
  it("parses assistant deltas from gateway event lines", () => {
    const ts = "2026-03-06T15:00:00.000Z";
    const line =
      '[openclaw-gateway:event] run=run-1 stream=assistant data={"delta":"hello"}';

    expect(parseOpenClawGatewayStdoutLine(line, ts)).toEqual([
      {
        kind: "assistant",
        ts,
        text: "hello",
        delta: true,
      },
    ]);
  });
});

describe("openclaw gateway routing helpers", () => {
  it("matches glob patterns", () => {
    expect(matchPattern("timer:*", "timer:heartbeat_timer")).toBe(true);
    expect(matchPattern("*:issue_*", "assignment:issue_assigned")).toBe(true);
    expect(matchPattern("assignment:issue_*", "timer:issue_assigned")).toBe(false);
  });

  it("interpolates template variables with mustache and dollar styles", () => {
    const text = interpolateTemplate("session:{{payloadTemplate.agentId}}:${runId}:${issueId}", {
      payloadTemplate: {
        agentId: "agent-1",
      },
      runId: "run-1",
      issueId: "issue-1",
    });
    expect(text).toBe("session:agent-1:run-1:issue-1");
  });

  it("resolves dot-path template variables", () => {
    const text = interpolateTemplate(
      "session:{{project.metadata.sessionKey}}:${project.id}:${project.name}",
      {
        project: {
          id: "project-1",
          name: "Core Platform",
          metadata: {
            sessionKey: "project-session-1",
          },
        },
      },
    );
    expect(text).toBe("session:project-session-1:project-1:Core Platform");
  });

  it("resolves nested values with resolveDotPath helper", () => {
    const variables = {
      project: {
        metadata: {
          routes: {
            primary: "alpha",
          },
        },
      },
    };

    expect(resolveDotPath(variables, "project.metadata.routes.primary")).toBe("alpha");
    expect(resolveDotPath(variables, "project.metadata.missing")).toBeUndefined();
    expect(resolveDotPath(variables, "project.metadata")).toEqual({ routes: { primary: "alpha" } });
  });

  it("resolves first matching routing rule and interpolates values", () => {
    const result = resolveSessionKeyFromRouting({
      routingRules: [
        { pattern: "*:issue_*", sessionKey: "issue:${issueId}" },
        { pattern: "timer:*", sessionKey: "timer:${runId}" },
      ],
      wakeSource: "assignment",
      wakeReason: "issue_assigned",
      runId: "run-1",
      issueId: "issue-1",
      payloadTemplate: {
        agentId: "gateway-agent-1",
      },
      project: {
        id: null,
        name: null,
        metadata: null,
      },
      fallback: {
        strategy: "run",
        configuredSessionKey: "fallback-session",
      },
    });

    expect(result).toBe("issue:issue-1");
  });

  it("resolves payloadTemplate dot-path variables", () => {
    const result = resolveSessionKeyFromRouting({
      routingRules: [
        { pattern: "assignment:*", sessionKey: "route:{{payloadTemplate.agentId}}|{{issueId}}" },
        { pattern: "assignment:*", sessionKey: "route:fallback" },
      ],
      wakeSource: "assignment",
      wakeReason: "issue_assigned",
      runId: "run-1",
      issueId: "issue-1",
      payloadTemplate: {
        agentId: "main",
      },
      project: {
        id: null,
        name: null,
        metadata: null,
      },
      fallback: {
        strategy: "fixed",
        configuredSessionKey: "fallback-session",
      },
    });

    expect(result).toBe("route:main|issue-1");
  });

  it("handles null payloadTemplate and continues with flat system variables", () => {
    const result = resolveSessionKeyFromRouting({
      routingRules: [
        { pattern: "assignment:*", sessionKey: "route:{{payloadTemplate.agentId}}" },
        { pattern: "assignment:*", sessionKey: "route:{{wakeSource}}|{{issueId}}" },
      ],
      wakeSource: "assignment",
      wakeReason: "issue_assigned",
      runId: "run-1",
      issueId: "issue-1",
      payloadTemplate: null,
      project: {
        id: null,
        name: null,
        metadata: null,
      },
      fallback: {
        strategy: "fixed",
        configuredSessionKey: "fallback-session",
      },
    });

    expect(result).toBe("route:assignment|issue-1");
  });

  it("handles empty payloadTemplate and continues with flat system variables", () => {
    const result = resolveSessionKeyFromRouting({
      routingRules: [
        { pattern: "assignment:*", sessionKey: "route:{{payloadTemplate.agentId}}" },
        { pattern: "assignment:*", sessionKey: "route:{{runId}}|{{issueId}}" },
      ],
      wakeSource: "assignment",
      wakeReason: "issue_assigned",
      runId: "run-1",
      issueId: "issue-1",
      payloadTemplate: {},
      project: {
        id: null,
        name: null,
        metadata: null,
      },
      fallback: {
        strategy: "fixed",
        configuredSessionKey: "fallback-session",
      },
    });

    expect(result).toBe("route:run-1|issue-1");
  });

  it("does not gate routing on dollar-template variables", () => {
    const result = resolveSessionKeyFromRouting({
      routingRules: [
        { pattern: "assignment:*", sessionKey: "route:${payloadTemplate.agentId}|{{issueId}}" },
        { pattern: "assignment:*", sessionKey: "route:fallback" },
      ],
      wakeSource: "assignment",
      wakeReason: "issue_assigned",
      runId: "run-1",
      issueId: "issue-1",
      payloadTemplate: {},
      project: {
        id: null,
        name: null,
        metadata: null,
      },
      fallback: {
        strategy: "fixed",
        configuredSessionKey: "fallback-session",
      },
    });

    expect(result).toBe("route:|issue-1");
  });

  it("falls back to legacy strategy behavior when no rule matches", () => {
    const result = resolveSessionKeyFromRouting({
      routingRules: [{ pattern: "timer:*", sessionKey: "timer:${runId}" }],
      wakeSource: "on_demand",
      wakeReason: "issue_assigned",
      runId: "run-1",
      issueId: "issue-1",
      payloadTemplate: {
        agentId: "gateway-agent-1",
      },
      project: {
        id: null,
        name: null,
        metadata: null,
      },
      fallback: {
        strategy: "fixed",
        configuredSessionKey: "fallback-session",
      },
    });

    expect(result).toBe("fallback-session");
  });

  it("routes with project metadata dot-path variables and skips unknown dot-paths", () => {
    const result = resolveSessionKeyFromRouting({
      routingRules: [
        { pattern: "assignment:*", sessionKey: "route:{{project.metadata.unknown}}" },
        { pattern: "assignment:*", sessionKey: "route:{{project.metadata.sessionKey}}" },
      ],
      wakeSource: "assignment",
      wakeReason: "issue_assigned",
      runId: "run-1",
      issueId: "issue-1",
      payloadTemplate: {
        agentId: "gateway-agent-1",
      },
      project: {
        id: "project-1",
        name: "Core Platform",
        metadata: {
          sessionKey: "project-session-1",
        },
      },
      fallback: {
        strategy: "fixed",
        configuredSessionKey: "fallback-session",
      },
    });

    expect(result).toBe("route:project-session-1");
  });
});

describe("openclaw gateway adapter execute", () => {
  it("runs connect -> agent -> agent.wait and forwards wake payload", async () => {
    const gateway = await createMockGatewayServer();
    const logs: string[] = [];

    try {
      const result = await execute(
        buildContext(
          {
            url: gateway.url,
            headers: {
              "x-openclaw-token": "gateway-token",
            },
            payloadTemplate: {
              message: "wake now",
            },
            waitTimeoutMs: 2000,
          },
          {
            onLog: async (_stream, chunk) => {
              logs.push(chunk);
            },
            context: {
              taskId: "task-123",
              issueId: "issue-123",
              wakeReason: "issue_assigned",
              issueIds: ["issue-123"],
              paperclipWorkspace: {
                cwd: "/tmp/worktrees/pap-123",
                strategy: "git_worktree",
                branchName: "pap-123-test",
              },
              paperclipWorkspaces: [
                {
                  id: "workspace-1",
                  cwd: "/tmp/project",
                },
              ],
              paperclipRuntimeServiceIntents: [
                {
                  name: "preview",
                  lifecycle: "ephemeral",
                },
              ],
            },
          },
        ),
      );

      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.summary).toContain("chachacha");
      expect(result.provider).toBe("openclaw");

      const payload = gateway.getAgentPayload();
      expect(payload).toBeTruthy();
      expect(payload?.idempotencyKey).toBe("run-123");
      expect(payload?.sessionKey).toBe("paperclip:issue:issue-123");
      expect(String(payload?.message ?? "")).toContain("wake now");
      expect(String(payload?.message ?? "")).toContain("PAPERCLIP_RUN_ID=run-123");
      expect(String(payload?.message ?? "")).toContain("PAPERCLIP_TASK_ID=task-123");
      expect(String(payload?.message ?? "")).toContain(
        "~/.openclaw/workspace/paperclip-claimed-api-key.json",
      );

      expect(logs.some((entry) => entry.includes("[openclaw-gateway:event] run=run-123 stream=assistant"))).toBe(true);
    } finally {
      await gateway.close();
    }
  });

  it("uses configured apiKeyPath in wake text", async () => {
    const gateway = await createMockGatewayServer();

    try {
      const result = await execute(
        buildContext({
          url: gateway.url,
          headers: {
            "x-openclaw-token": "gateway-token",
          },
          apiKeyPath: "~/custom/openclaw/paperclip-key.json",
          waitTimeoutMs: 2000,
        }),
      );

      expect(result.exitCode).toBe(0);
      const payload = gateway.getAgentPayload();
      expect(payload).toBeTruthy();
      expect(String(payload?.message ?? "")).toContain(
        "PAPERCLIP_API_KEY=<token from ~/custom/openclaw/paperclip-key.json>",
      );
      expect(String(payload?.message ?? "")).toContain(
        "Load PAPERCLIP_API_KEY from ~/custom/openclaw/paperclip-key.json",
      );
    } finally {
      await gateway.close();
    }
  });

  it("fails fast when url is missing", async () => {
    const result = await execute(buildContext({}));
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("openclaw_gateway_url_missing");
  });

  it("returns adapter-managed runtime services from gateway result meta", async () => {
    const gateway = await createMockGatewayServer({
      waitPayload: {
        runId: "run-123",
        status: "ok",
        startedAt: 1,
        endedAt: 2,
        meta: {
          runtimeServices: [
            {
              name: "preview",
              scopeType: "run",
              url: "https://preview.example/run-123",
              providerRef: "sandbox-123",
              lifecycle: "ephemeral",
            },
          ],
        },
      },
    });

    try {
      const result = await execute(
        buildContext({
          url: gateway.url,
          headers: {
            "x-openclaw-token": "gateway-token",
          },
          waitTimeoutMs: 2000,
        }),
      );

      expect(result.exitCode).toBe(0);
      expect(result.runtimeServices).toEqual([
        expect.objectContaining({
          serviceName: "preview",
          scopeType: "run",
          url: "https://preview.example/run-123",
          providerRef: "sandbox-123",
          lifecycle: "ephemeral",
          status: "running",
        }),
      ]);
    } finally {
      await gateway.close();
    }
  });

  it("auto-approves pairing once and retries the run", async () => {
    const gateway = await createMockGatewayServerWithPairing();
    const logs: string[] = [];

    try {
      const result = await execute(
        buildContext(
          {
            url: gateway.url,
            headers: {
              "x-openclaw-token": "gateway-token",
            },
            payloadTemplate: {
              message: "wake now",
            },
            waitTimeoutMs: 2000,
          },
          {
            onLog: async (_stream, chunk) => {
              logs.push(chunk);
            },
          },
        ),
      );

      expect(result.exitCode).toBe(0);
      expect(result.summary).toContain("ok");
      expect(logs.some((entry) => entry.includes("pairing required; attempting automatic pairing approval"))).toBe(
        true,
      );
      expect(logs.some((entry) => entry.includes("auto-approved pairing request"))).toBe(true);
      expect(gateway.getAgentPayload()).toBeTruthy();
    } finally {
      await gateway.close();
    }
  });

  it("uses routing strategy session key when configured", async () => {
    const gateway = await createMockGatewayServer();

    try {
      const result = await execute(
        buildContext(
          {
            url: gateway.url,
            headers: {
              "x-openclaw-token": "gateway-token",
            },
            sessionKeyStrategy: "routing",
            sessionKeyRouting: [
              {
                pattern: "assignment:*",
                sessionKey: "route:{{project.metadata.sessionKey}}:{{payloadTemplate.agentId}}:{{issueId}}",
              },
              { pattern: "*:*", sessionKey: "route:default" },
            ],
            payloadTemplate: {
              agentId: "agent-123",
            },
            waitTimeoutMs: 2000,
          },
          {
            context: {
              taskId: "task-123",
              issueId: "issue-123",
              projectId: "project-123",
              wakeSource: "assignment",
              wakeReason: "issue_assigned",
              issueIds: ["issue-123"],
              project: {
                id: "project-123",
                name: "Project Alpha",
                metadata: {
                  sessionKey: "project-session-123",
                },
              },
            },
          },
        ),
      );

      expect(result.exitCode).toBe(0);
      expect(gateway.getAgentPayload()?.sessionKey).toBe("route:project-session-123:agent-123:issue-123");
    } finally {
      await gateway.close();
    }
  });

  it("keeps legacy session key behavior when strategy is not routing", async () => {
    const gateway = await createMockGatewayServer();

    try {
      const result = await execute(
        buildContext({
          url: gateway.url,
          headers: {
            "x-openclaw-token": "gateway-token",
          },
          sessionKeyStrategy: "run",
          sessionKeyRouting: [{ pattern: "*:*", sessionKey: "route:{{runId}}" }],
          waitTimeoutMs: 2000,
        }),
      );

      expect(result.exitCode).toBe(0);
      expect(gateway.getAgentPayload()?.sessionKey).toBe("paperclip:run:run-123");
    } finally {
      await gateway.close();
    }
  });
});

describe("openclaw gateway ui build config", () => {
  it("parses payload template and runtime services json", () => {
    const config = buildOpenClawGatewayConfig({
      adapterType: "openclaw_gateway",
      cwd: "",
      promptTemplate: "",
      model: "",
      thinkingEffort: "",
      chrome: false,
      dangerouslySkipPermissions: false,
      search: false,
      dangerouslyBypassSandbox: false,
      command: "",
      args: "",
      extraArgs: "",
      envVars: "",
      envBindings: {},
      url: "wss://gateway.example/ws",
      payloadTemplateJson: JSON.stringify({
        agentId: "remote-agent-123",
        metadata: { team: "platform" },
      }),
      runtimeServicesJson: JSON.stringify({
        services: [
          {
            name: "preview",
            lifecycle: "shared",
          },
        ],
      }),
      bootstrapPrompt: "",
      maxTurnsPerRun: 0,
      heartbeatEnabled: true,
      intervalSec: 300,
    });

    expect(config).toEqual(
      expect.objectContaining({
        url: "wss://gateway.example/ws",
        payloadTemplate: {
          agentId: "remote-agent-123",
          metadata: { team: "platform" },
        },
        workspaceRuntime: {
          services: [
            {
              name: "preview",
              lifecycle: "shared",
            },
          ],
        },
      }),
    );
  });
});

describe("openclaw gateway testEnvironment", () => {
  it("reports missing url as failure", async () => {
    const result = await testEnvironment({
      companyId: "company-123",
      adapterType: "openclaw_gateway",
      config: {},
    });

    expect(result.status).toBe("fail");
    expect(result.checks.some((check) => check.code === "openclaw_gateway_url_missing")).toBe(true);
  });
});
