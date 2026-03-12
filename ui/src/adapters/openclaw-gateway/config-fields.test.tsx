import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { OpenClawGatewayConfigFields } from "./config-fields";
import { RoutingRulesEditor } from "./routing-rules-editor";
import { TooltipProvider } from "../../components/ui/tooltip";
import type { AdapterConfigFieldsProps } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeProps(strategy: string, mark = vi.fn()) {
  return {
    mode: "edit",
    isCreate: false,
    adapterType: "openclaw_gateway",
    values: null,
    set: null,
    config: {
      sessionKeyStrategy: strategy,
      sessionKeyRouting: [{ pattern: "timer:*", sessionKey: "timer-key" }],
    },
    eff: <T,>(_scope: "adapterConfig", key: string, fallback: T): T => {
      if (key === "sessionKeyStrategy") return strategy as T;
      return fallback;
    },
    mark,
    models: [],
  } satisfies AdapterConfigFieldsProps;
}

function renderConfig(strategy: string, mark = vi.fn()) {
  const props = makeProps(strategy, mark);
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <TooltipProvider>
        <OpenClawGatewayConfigFields {...props} />
      </TooltipProvider>,
    );
  });
  return { tree, mark };
}

describe("OpenClawGatewayConfigFields routing strategy", () => {
  it("includes Rule-based routing option", () => {
    const { tree } = renderConfig("fixed");
    const select = tree.root.findAllByType("select")[0];
    const options = select.findAllByType("option");
    expect(options.some((entry: TestRenderer.ReactTestInstance) => entry.props.value === "routing" && entry.props.children === "Rule-based")).toBe(true);
  });

  it("renders RoutingRulesEditor only when routing is selected", () => {
    const { tree: fixedTree } = renderConfig("fixed");
    expect(fixedTree.root.findAllByType(RoutingRulesEditor)).toHaveLength(0);

    const { tree: routingTree } = renderConfig("routing");
    expect(routingTree.root.findAllByType(RoutingRulesEditor)).toHaveLength(1);
  });

  it("commits parsed sessionKeyRouting when routing editor changes", () => {
    const mark = vi.fn();
    const { tree } = renderConfig("routing", mark);
    const editor = tree.root.findByType(RoutingRulesEditor);

    act(() => {
      editor.props.onChange([
        { pattern: " assignment:* ", sessionKey: " key:{{issueId}} " },
        { pattern: "", sessionKey: "x" },
      ]);
    });

    expect(mark).toHaveBeenCalledWith("adapterConfig", "sessionKeyRouting", [
      { pattern: "assignment:*", sessionKey: "key:{{issueId}}" },
    ]);
  });

  it("wires dropdown changes to sessionKeyStrategy", () => {
    const mark = vi.fn();
    const { tree } = renderConfig("fixed", mark);
    const select = tree.root.findAllByType("select")[0];

    act(() => {
      select.props.onChange({ target: { value: "routing" } });
    });

    expect(mark).toHaveBeenCalledWith("adapterConfig", "sessionKeyStrategy", "routing");
  });
});
