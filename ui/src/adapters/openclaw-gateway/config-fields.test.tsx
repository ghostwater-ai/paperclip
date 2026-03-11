import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OpenClawGatewayConfigFields } from "./config-fields";
import { TooltipProvider } from "@/components/ui/tooltip";

function Harness({ markSpy }: { markSpy: ReturnType<typeof vi.fn> }) {
  const [config, setConfig] = useState<Record<string, unknown>>({
    sessionKeyStrategy: "fixed",
    sessionKey: "paperclip",
  });

  return (
    <TooltipProvider>
      <OpenClawGatewayConfigFields
        mode="edit"
        isCreate={false}
        adapterType="openclaw_gateway"
        values={null}
        set={null}
        config={config}
        eff={(_, field, original) => (field in config ? (config[field] as typeof original) : original)}
        mark={(group, field, value) => {
          markSpy(group, field, value);
          setConfig((previous) => ({ ...previous, [field]: value }));
        }}
        models={[]}
      />
    </TooltipProvider>
  );
}

describe("OpenClawGatewayConfigFields", () => {
  afterEach(() => {
    cleanup();
  });

  it("writes session key routing updates through mark(adapterConfig, sessionKeyRouting, rules)", () => {
    const mark = vi.fn();

    render(<Harness markSpy={mark} />);

    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(screen.getByLabelText("Routing pattern 1"), {
      target: { value: "assignment:*" },
    });
    fireEvent.change(screen.getByLabelText("Session key template 1"), {
      target: { value: "{{projectSessionKey}}" },
    });

    expect(mark).toHaveBeenCalledWith("adapterConfig", "sessionKeyRouting", [{ pattern: "", sessionKey: "" }]);
    expect(mark).toHaveBeenLastCalledWith("adapterConfig", "sessionKeyRouting", [
      { pattern: "assignment:*", sessionKey: "{{projectSessionKey}}" },
    ]);

    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByDisplayValue("paperclip")).toBeTruthy();
  });
});
