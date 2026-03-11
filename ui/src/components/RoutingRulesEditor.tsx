import { useEffect, useMemo, useState } from "react";
import { DraftInput } from "./agent-config-primitives";

export type RoutingRule = {
  pattern: string;
  sessionKey: string;
};

type RoutingRulesEditorProps = {
  rules: RoutingRule[];
  onChange: (rules: RoutingRule[]) => void;
  className?: string;
};

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const emptyRule: RoutingRule = {
  pattern: "",
  sessionKey: "",
};

function cloneRules(rules: RoutingRule[]): RoutingRule[] {
  return rules.map((rule) => ({
    pattern: rule.pattern,
    sessionKey: rule.sessionKey,
  }));
}

export function parseRoutingRules(value: unknown): RoutingRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: RoutingRule[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const pattern = (entry as Record<string, unknown>).pattern;
    const sessionKey = (entry as Record<string, unknown>).sessionKey;
    if (typeof pattern !== "string" || typeof sessionKey !== "string") continue;
    parsed.push({ pattern, sessionKey });
  }

  return parsed;
}

function moveRule(rules: RoutingRule[], fromIndex: number, toIndex: number): RoutingRule[] {
  if (toIndex < 0 || toIndex >= rules.length || fromIndex === toIndex) {
    return rules;
  }
  const next = cloneRules(rules);
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function RoutingRulesEditor({ rules, onChange, className }: RoutingRulesEditorProps) {
  const normalizedRules = useMemo(() => cloneRules(parseRoutingRules(rules)), [rules]);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (!jsonMode) return;
    setJsonDraft(JSON.stringify(normalizedRules, null, 2));
  }, [jsonMode, normalizedRules]);

  const updateRule = (index: number, patch: Partial<RoutingRule>) => {
    const next = cloneRules(normalizedRules);
    next[index] = {
      ...next[index],
      ...patch,
    };
    onChange(next);
  };

  const handleJsonChange = (value: string) => {
    setJsonDraft(value);

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      setJsonError("Invalid JSON.");
      return;
    }

    const parsedRules = parseRoutingRules(parsedValue);
    const parsedArrayLength = Array.isArray(parsedValue) ? parsedValue.length : -1;
    if (!Array.isArray(parsedValue) || parsedRules.length !== parsedArrayLength) {
      setJsonError("JSON must be an array of { pattern, sessionKey } objects.");
      return;
    }

    setJsonError(null);
    onChange(parsedRules);
  };

  return (
    <div className={className ?? "space-y-2"}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Ordered rules, first match wins.</span>
        <button
          type="button"
          className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
          onClick={() => {
            setJsonMode((current) => {
              const next = !current;
              if (next) {
                setJsonDraft(JSON.stringify(normalizedRules, null, 2));
                setJsonError(null);
              }
              return next;
            });
          }}
        >
          {jsonMode ? "Edit as Rows" : "Edit as JSON"}
        </button>
      </div>

      {jsonMode ? (
        <div className="space-y-1.5">
          <textarea
            aria-label="Session key routing JSON"
            className={inputClass + " min-h-[180px] resize-y"}
            value={jsonDraft}
            onChange={(event) => handleJsonChange(event.target.value)}
            placeholder='[{"pattern":"timer:*","sessionKey":"heartbeat"}]'
          />
          {jsonError ? (
            <div role="alert" className="text-xs text-destructive">
              {jsonError}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          {normalizedRules.map((rule, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
              <DraftInput
                aria-label={`Routing pattern ${index + 1}`}
                value={rule.pattern}
                onCommit={(value) => updateRule(index, { pattern: value })}
                immediate
                className={inputClass}
                placeholder="automation:issue_*"
              />
              <DraftInput
                aria-label={`Session key template ${index + 1}`}
                value={rule.sessionKey}
                onCommit={(value) => updateRule(index, { sessionKey: value })}
                immediate
                className={inputClass}
                placeholder="{{projectSessionKey}}"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Move rule ${index + 1} up`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:bg-accent/50 transition-colors disabled:opacity-40"
                  disabled={index === 0}
                  onClick={() => onChange(moveRule(normalizedRules, index, index - 1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move rule ${index + 1} down`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:bg-accent/50 transition-colors disabled:opacity-40"
                  disabled={index === normalizedRules.length - 1}
                  onClick={() => onChange(moveRule(normalizedRules, index, index + 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove rule ${index + 1}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
                  onClick={() => onChange(normalizedRules.filter((_, entryIndex) => entryIndex !== index))}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
            onClick={() => onChange([...normalizedRules, { ...emptyRule }])}
          >
            Add rule
          </button>
        </div>
      )}
    </div>
  );
}
