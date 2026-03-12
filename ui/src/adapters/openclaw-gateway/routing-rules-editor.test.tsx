import React, { useState } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import {
  addRule,
  deleteRule,
  moveRule,
  replaceRule,
  RoutingRulesEditor,
  templateVariables,
  wakeReasons,
  wakeSources,
} from "./routing-rules-editor";
import { parseSessionKeyRouting, parseSessionKeyRoutingJson } from "./session-key-routing";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ initial }: { initial: Array<{ pattern: string; sessionKey: string }> }) {
  const [rules, setRules] = useState(initial);
  return <RoutingRulesEditor value={rules} onChange={setRules} />;
}

function renderEditor(initial: Array<{ pattern: string; sessionKey: string }>) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Harness initial={initial} />);
  });
  return tree;
}

function clickButton(tree: TestRenderer.ReactTestRenderer, label: string) {
  const button = tree.root.findAllByType("button").find((entry: TestRenderer.ReactTestInstance) => {
    const children = entry.props.children;
    if (typeof children === "string") return children === label;
    if (Array.isArray(children)) return children.some((child) => child === label);
    return false;
  });
  if (!button) throw new Error(`Button not found: ${label}`);
  act(() => {
    button.props.onClick?.({ defaultPrevented: false, preventDefault: () => {} });
  });
}

describe("session-key-routing helpers", () => {
  it("parses and sanitizes routing rules", () => {
    expect(
      parseSessionKeyRouting([
        { pattern: " assignment:* ", sessionKey: " key:{{issueId}} " },
        { pattern: "", sessionKey: "x" },
        { pattern: "x", sessionKey: "" },
      ]),
    ).toEqual([{ pattern: "assignment:*", sessionKey: "key:{{issueId}}" }]);
  });

  it("parses JSON payloads", () => {
    expect(parseSessionKeyRoutingJson('[{"pattern":"*:*","sessionKey":"paperclip:{{runId}}"}]')).toEqual({
      rules: [{ pattern: "*:*", sessionKey: "paperclip:{{runId}}" }],
      error: null,
    });
    expect(parseSessionKeyRoutingJson("{bad").error).toBe("Invalid JSON.");
    expect(
      parseSessionKeyRoutingJson(
        '[{"pattern":"*:*","sessionKey":"paperclip:{{runId}}"},{"pattern":"","sessionKey":"x"}]',
      ),
    ).toEqual({
      rules: [{ pattern: "*:*", sessionKey: "paperclip:{{runId}}" }],
      error: "Every entry must include non-empty string fields: pattern and sessionKey.",
    });
  });

  it("supports add, replace, reorder, and delete operations", () => {
    const added = addRule([]);
    expect(added).toEqual([{ pattern: "*:*", sessionKey: "paperclip:{{runId}}" }]);

    const replaced = replaceRule(added, 0, "pattern", "assignment:*");
    expect(replaced[0].pattern).toBe("assignment:*");

    const reordered = moveRule(
      [
        { pattern: "a", sessionKey: "sa" },
        { pattern: "b", sessionKey: "sb" },
      ],
      0,
      1,
    );
    expect(reordered.map((rule) => rule.pattern)).toEqual(["b", "a"]);

    expect(deleteRule(reordered, 1).map((rule) => rule.pattern)).toEqual(["b"]);
  });
});

describe("RoutingRulesEditor", () => {
  it("supports add/delete/reorder in row mode", () => {
    const tree = renderEditor([{ pattern: "a:*", sessionKey: "A" }]);

    clickButton(tree, "Add rule");
    let patternInputs = tree.root
      .findAllByType("input")
      .filter((entry: TestRenderer.ReactTestInstance) => entry.props.placeholder === "assignment:*");
    expect(patternInputs).toHaveLength(2);

    clickButton(tree, "Down");
    patternInputs = tree.root
      .findAllByType("input")
      .filter((entry: TestRenderer.ReactTestInstance) => entry.props.placeholder === "assignment:*");
    expect(patternInputs[0].props.value).toBe("*:*");

    clickButton(tree, "Delete");
    patternInputs = tree.root
      .findAllByType("input")
      .filter((entry: TestRenderer.ReactTestInstance) => entry.props.placeholder === "assignment:*");
    expect(patternInputs).toHaveLength(1);
  });

  it("supports JSON editing mode and keeps valid rules", () => {
    const tree = renderEditor([{ pattern: "timer:*", sessionKey: "base" }]);

    clickButton(tree, "Edit as JSON");
    const textarea = tree.root.findByType("textarea");
    act(() => {
      textarea.props.onChange({ target: { value: '[{"pattern":"assignment:*","sessionKey":"route:{{issueId}}"}]' } });
    });

    clickButton(tree, "Edit as Rows");
    const patternInput = tree.root.findByProps({ placeholder: "assignment:*" });
    expect(patternInput.props.value).toBe("assignment:*");

    clickButton(tree, "Edit as JSON");
    const textareaWithInvalid = tree.root.findByType("textarea");
    act(() => {
      textareaWithInvalid.props.onChange({ target: { value: "{bad" } });
    });
    const error = tree.root.findAllByProps({ className: "text-xs text-destructive" });
    expect(error.length).toBeGreaterThan(0);
  });

  it("renders help trigger and required reference data", () => {
    const tree = renderEditor([]);
    expect(
      tree.root.findAllByType("button").some((entry: TestRenderer.ReactTestInstance) => {
        const children = entry.props.children;
        if (typeof children === "string") return children === "Help";
        if (Array.isArray(children)) return children.some((child) => child === "Help");
        return false;
      }),
    ).toBe(true);
    expect(wakeSources).toEqual(["timer", "assignment", "on_demand", "automation", "scheduler"]);
    expect(wakeReasons).toContain("issue_assigned");
    expect(wakeReasons).toContain("stale_checkout_run");
    expect(templateVariables).toEqual([
      "payloadTemplate.<key>",
      "issueId",
      "runId",
      "wakeSource",
      "wakeReason",
      "project.id",
      "project.name",
      "project.metadata.<key>",
    ]);
  });
});
