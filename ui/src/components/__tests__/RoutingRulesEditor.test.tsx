import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  RoutingRulesEditor,
  type RoutingRule,
} from "../RoutingRulesEditor";

type HarnessProps = {
  initialRules?: RoutingRule[];
  onRules?: (rules: RoutingRule[]) => void;
};

function Harness({ initialRules = [], onRules }: HarnessProps) {
  const [rules, setRules] = useState<RoutingRule[]>(initialRules);

  return (
    <RoutingRulesEditor
      rules={rules}
      onChange={(next) => {
        setRules(next);
        onRules?.(next);
      }}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe("RoutingRulesEditor", () => {
  it("shows a row-mode reference trigger and opens/closes the help modal with required sections", () => {
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Routing rules reference" });
    expect(trigger).toBeTruthy();

    fireEvent.click(trigger);

    expect(screen.getByRole("heading", { name: "Routing Rules Reference" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pattern Format" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Source / Reason Reference" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pattern Matching Examples" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Template Variable Reference" })).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(screen.queryByRole("heading", { name: "Routing Rules Reference" })).toBeNull();
  });

  it("supports add, remove, reorder and emits ordered rules", () => {
    const onRules = vi.fn();
    render(<Harness onRules={onRules} />);

    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));

    fireEvent.change(screen.getByLabelText("Routing pattern 1"), {
      target: { value: "assignment:*" },
    });
    fireEvent.change(screen.getByLabelText("Session key template 1"), {
      target: { value: "route:a" },
    });
    fireEvent.change(screen.getByLabelText("Routing pattern 2"), {
      target: { value: "timer:*" },
    });
    fireEvent.change(screen.getByLabelText("Session key template 2"), {
      target: { value: "route:b" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Move rule 2 up" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove rule 2" }));

    const calls = onRules.mock.calls as Array<[RoutingRule[]]>;
    expect(calls[calls.length - 1][0]).toEqual([
      {
        pattern: "timer:*",
        sessionKey: "route:b",
      },
    ]);
  });

  it("round-trips valid JSON and preserves rule order/values", () => {
    const onRules = vi.fn();
    render(
      <Harness
        initialRules={[
          { pattern: "timer:*", sessionKey: "heartbeat" },
          { pattern: "*", sessionKey: "fallback" },
        ]}
        onRules={onRules}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit as JSON" }));
    const textarea = screen.getByLabelText("Session key routing JSON");

    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify(
          [
            { pattern: "assignment:*", sessionKey: "{{projectSessionKey}}" },
            { pattern: "*", sessionKey: "paperclip" },
          ],
          null,
          2,
        ),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit as Rows" }));

    expect((screen.getByLabelText("Routing pattern 1") as HTMLInputElement).value).toBe("assignment:*");
    expect((screen.getByLabelText("Session key template 1") as HTMLInputElement).value).toBe("{{projectSessionKey}}");
    expect((screen.getByLabelText("Routing pattern 2") as HTMLInputElement).value).toBe("*");
    expect((screen.getByLabelText("Session key template 2") as HTMLInputElement).value).toBe("paperclip");

    const calls = onRules.mock.calls as Array<[RoutingRule[]]>;
    expect(calls[calls.length - 1][0]).toEqual([
      { pattern: "assignment:*", sessionKey: "{{projectSessionKey}}" },
      { pattern: "*", sessionKey: "paperclip" },
    ]);
  });

  it("shows JSON validation errors and keeps current rules when JSON is invalid", () => {
    const onRules = vi.fn();
    render(
      <Harness
        initialRules={[{ pattern: "timer:*", sessionKey: "heartbeat" }]}
        onRules={onRules}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit as JSON" }));
    fireEvent.change(screen.getByLabelText("Session key routing JSON"), {
      target: { value: "not-json" },
    });

    expect(screen.getByRole("alert").textContent ?? "").toContain("Invalid JSON");
    expect(onRules).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit as Rows" }));

    expect((screen.getByLabelText("Routing pattern 1") as HTMLInputElement).value).toBe("timer:*");
    expect((screen.getByLabelText("Session key template 1") as HTMLInputElement).value).toBe("heartbeat");
  });
});
