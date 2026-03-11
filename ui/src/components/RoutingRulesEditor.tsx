import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { DraftInput } from "./agent-config-primitives";

export type RoutingRule = {
  pattern: string;
  sessionKey: string;
};

type RoutingRulesEditorProps = {
  rules: RoutingRule[];
  onChange: (rules: RoutingRule[]) => void;
  immediate?: boolean;
  className?: string;
};

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const emptyRule: RoutingRule = {
  pattern: "",
  sessionKey: "",
};

const sourceReasonReference: Array<{ source: string; reasons: string }> = [
  { source: "timer", reasons: "heartbeat_timer, interval_elapsed" },
  { source: "assignment", reasons: "issue_assigned, issue_checked_out" },
  {
    source: "automation",
    reasons: "issue_status_changed, issue_comment_mentioned, issue_commented, issue_reopened_via_comment",
  },
  { source: "on_demand", reasons: "manual, ping, callback, system" },
];

const patternExamples: Array<{ pattern: string; meaning: string }> = [
  { pattern: "*", meaning: "Matches every source:reason event." },
  { pattern: "timer:*", meaning: "Matches any timer reason." },
  { pattern: "*:issue_assigned", meaning: "Matches issue_assigned from any source." },
  { pattern: "automation:issue_*", meaning: "Matches automation reasons starting with issue_." },
  { pattern: "timer:heartbeat_timer", meaning: "Exact match for one source:reason pair." },
];

const templateVariables: Array<{ variable: string; description: string }> = [
  { variable: "wakeSource", description: "Event source used by the pattern match." },
  { variable: "wakeReason", description: "Event reason used by the pattern match." },
  { variable: "projectId", description: "Project id for project-scoped events." },
  { variable: "projectSessionKey", description: "Project session key value when set on the project." },
  { variable: "issueId", description: "Issue id when the wake event is issue-related." },
  { variable: "runId", description: "Heartbeat run id for the current invocation." },
  { variable: "agentId", description: "Agent id for the run currently being routed." },
];

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

export function RoutingRulesEditor({ rules, onChange, immediate = true, className }: RoutingRulesEditorProps) {
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

  const parseJsonRules = (value: string): RoutingRule[] | null => {
    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      setJsonError("Invalid JSON.");
      return null;
    }

    const parsedRules = parseRoutingRules(parsedValue);
    const parsedArrayLength = Array.isArray(parsedValue) ? parsedValue.length : -1;
    if (!Array.isArray(parsedValue) || parsedRules.length !== parsedArrayLength) {
      setJsonError("JSON must be an array of { pattern, sessionKey } objects.");
      return null;
    }

    setJsonError(null);
    return parsedRules;
  };

  const handleJsonChange = (value: string) => {
    setJsonDraft(value);
    const parsedRules = parseJsonRules(value);
    if (immediate && parsedRules) {
      onChange(parsedRules);
    }
  };

  const handleJsonBlur = () => {
    if (immediate) return;
    const parsedRules = parseJsonRules(jsonDraft);
    if (parsedRules) {
      onChange(parsedRules);
    }
  };

  return (
    <div className={className ?? "space-y-2"}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Ordered rules, first match wins.</span>
          {!jsonMode ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto p-0 text-xs text-muted-foreground"
                  aria-label="Routing rules reference"
                >
                  Reference
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-base">Routing Rules Reference</DialogTitle>
                  <DialogDescription>
                    Pattern syntax, source and reason values, routing examples, and template variables.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 text-sm">
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Pattern Format</h3>
                    <p className="text-muted-foreground">
                      Patterns match against <span className="font-mono">source:reason</span> using glob wildcards.
                    </p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      <li>
                        Use <span className="font-mono">*</span> to match everything.
                      </li>
                      <li>
                        Use <span className="font-mono">timer:*</span> to match a source with any reason.
                      </li>
                      <li>
                        Use <span className="font-mono">*:issue_assigned</span> to match a reason from any source.
                      </li>
                      <li>
                        Use <span className="font-mono">automation:issue_*</span> for prefix matching.
                      </li>
                    </ul>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Source / Reason Reference</h3>
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-accent/40">
                          <tr>
                            <th className="px-2 py-1.5 font-medium">Source</th>
                            <th className="px-2 py-1.5 font-medium">Common Reasons</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sourceReasonReference.map((entry) => (
                            <tr key={entry.source} className="border-t border-border">
                              <td className="px-2 py-1.5 font-mono">{entry.source}</td>
                              <td className="px-2 py-1.5 font-mono">{entry.reasons}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Pattern Matching Examples</h3>
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-accent/40">
                          <tr>
                            <th className="px-2 py-1.5 font-medium">Pattern</th>
                            <th className="px-2 py-1.5 font-medium">Behavior</th>
                          </tr>
                        </thead>
                        <tbody>
                          {patternExamples.map((entry) => (
                            <tr key={entry.pattern} className="border-t border-border">
                              <td className="px-2 py-1.5 font-mono">{entry.pattern}</td>
                              <td className="px-2 py-1.5">{entry.meaning}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Template Variable Reference</h3>
                    <div className="overflow-x-auto rounded-md border border-border">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-accent/40">
                          <tr>
                            <th className="px-2 py-1.5 font-medium">Variable</th>
                            <th className="px-2 py-1.5 font-medium">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {templateVariables.map((entry) => (
                            <tr key={entry.variable} className="border-t border-border">
                              <td className="px-2 py-1.5 font-mono">{`{{${entry.variable}}}`}</td>
                              <td className="px-2 py-1.5">{entry.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      If a template variable cannot be resolved (for example{" "}
                      <span className="font-mono">{`{{projectSessionKey}}`}</span> when no project session key is
                      available), that rule is skipped and evaluation continues to the next rule.
                    </p>
                  </section>
                </div>

                <DialogFooter showCloseButton />
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
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
            onBlur={handleJsonBlur}
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
                immediate={immediate}
                className={inputClass}
                placeholder="automation:issue_*"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    (event.target as HTMLInputElement).blur();
                  }
                }}
              />
              <DraftInput
                aria-label={`Session key template ${index + 1}`}
                value={rule.sessionKey}
                onCommit={(value) => updateRule(index, { sessionKey: value })}
                immediate={immediate}
                className={inputClass}
                placeholder="{{projectSessionKey}}"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    (event.target as HTMLInputElement).blur();
                  }
                }}
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
