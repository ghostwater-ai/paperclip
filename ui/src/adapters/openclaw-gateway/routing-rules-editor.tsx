import { useEffect, useMemo, useState } from "react";
import { CircleHelp, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Field, DraftInput } from "../../components/agent-config-primitives";
import {
  parseSessionKeyRouting,
  parseSessionKeyRoutingJson,
  type SessionKeyRoutingRule,
} from "./session-key-routing";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export const wakeSources = ["timer", "assignment", "on_demand", "automation", "scheduler"];

export const wakeReasons = [
  "issue_assigned",
  "issue_comment_mentioned",
  "issue_status_changed",
  "issue_checked_out",
  "issue_reopened_via_comment",
  "issue_commented",
  "approval_approved",
  "heartbeat_timer",
  "interval_elapsed",
  "issue_execution_promoted",
  "issue_execution_issue_not_found",
  "issue_execution_same_name",
  "issue_execution_deferred",
  "stale_checkout_run",
];

export const templateVariables = [
  "paperclipAgentId",
  "adapterAgentId",
  "issueId",
  "runId",
  "wakeSource",
  "wakeReason",
];

export function moveRule(rules: SessionKeyRoutingRule[], fromIndex: number, toIndex: number): SessionKeyRoutingRule[] {
  if (fromIndex < 0 || fromIndex >= rules.length) return rules;
  if (toIndex < 0 || toIndex >= rules.length) return rules;
  const next = [...rules];
  const [rule] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, rule);
  return next;
}

export function replaceRule(
  rules: SessionKeyRoutingRule[],
  index: number,
  key: keyof SessionKeyRoutingRule,
  value: string,
): SessionKeyRoutingRule[] {
  if (index < 0 || index >= rules.length) return rules;
  const next = [...rules];
  next[index] = { ...next[index], [key]: value };
  return next;
}

export function deleteRule(rules: SessionKeyRoutingRule[], index: number): SessionKeyRoutingRule[] {
  if (index < 0 || index >= rules.length) return rules;
  return rules.filter((_rule, i) => i !== index);
}

export function addRule(rules: SessionKeyRoutingRule[]): SessionKeyRoutingRule[] {
  return [...rules, { pattern: "*:*", sessionKey: "paperclip:{{runId}}" }];
}

export function RoutingRulesEditor({
  value,
  onChange,
}: {
  value: SessionKeyRoutingRule[];
  onChange: (rules: SessionKeyRoutingRule[]) => void;
}) {
  const rules = useMemo(() => parseSessionKeyRouting(value), [value]);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("[]");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (!jsonMode) return;
    setJsonDraft(JSON.stringify(rules, null, 2));
  }, [jsonMode, rules]);

  return (
    <Field label="Session key routing rules">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Rules match <code>wakeSource:wakeReason</code>; first match wins.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs rounded-md border border-border px-2 py-1 hover:bg-accent/50"
              onClick={() => {
                const next = !jsonMode;
                setJsonMode(next);
                setJsonError(null);
                if (next) {
                  setJsonDraft(JSON.stringify(rules, null, 2));
                }
              }}
            >
              {jsonMode ? "Edit as Rows" : "Edit as JSON"}
            </button>
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs rounded-md border border-border px-2 py-1 hover:bg-accent/50"
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                  Help
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rule-Based Session Key Routing</DialogTitle>
                  <DialogDescription>
                    Match wake events with glob patterns and render session key templates.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 text-sm max-h-[60vh] overflow-auto pr-1">
                  <section>
                    <h4 className="font-medium mb-1">Wake sources</h4>
                    <table className="w-full text-xs border border-border rounded-md overflow-hidden">
                      <tbody>
                        {wakeSources.map((entry) => (
                          <tr key={entry} className="border-t border-border first:border-t-0">
                            <td className="px-2 py-1 font-mono">{entry}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>

                  <section>
                    <h4 className="font-medium mb-1">Wake reasons</h4>
                    <table className="w-full text-xs border border-border rounded-md overflow-hidden">
                      <tbody>
                        {wakeReasons.map((entry) => (
                          <tr key={entry} className="border-t border-border first:border-t-0">
                            <td className="px-2 py-1 font-mono">{entry}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>

                  <section>
                    <h4 className="font-medium mb-1">Glob examples</h4>
                    <ul className="list-disc pl-5 text-xs space-y-1">
                      <li><code>*:issue_assigned</code> matches any source with `issue_assigned`.</li>
                      <li><code>assignment:*</code> matches any reason from the `assignment` source.</li>
                      <li><code>scheduler:interval_*</code> matches scheduler interval reasons.</li>
                    </ul>
                  </section>

                  <section>
                    <h4 className="font-medium mb-1">Template variables</h4>
                    <table className="w-full text-xs border border-border rounded-md overflow-hidden">
                      <tbody>
                        {templateVariables.map((entry) => (
                          <tr key={entry} className="border-t border-border first:border-t-0">
                            <td className="px-2 py-1 font-mono">{entry}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {jsonMode ? (
          <div className="space-y-2">
            <textarea
              value={jsonDraft}
              onChange={(e) => {
                const nextText = e.target.value;
                setJsonDraft(nextText);
                const parsed = parseSessionKeyRoutingJson(nextText);
                setJsonError(parsed.error);
                if (!parsed.error) onChange(parsed.rules);
              }}
              className="w-full min-h-[180px] rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-xs font-mono"
              placeholder='[{ "pattern": "*:*", "sessionKey": "paperclip:{{runId}}" }]'
            />
            {jsonError && <div className="text-xs text-destructive">{jsonError}</div>}
          </div>
        ) : (
          <div className="space-y-2">
            {rules.length === 0 && (
              <div className="text-xs text-muted-foreground rounded-md border border-dashed border-border px-2.5 py-2">
                No routing rules yet.
              </div>
            )}
            {rules.map((rule, index) => (
              <div key={index} className="rounded-md border border-border p-2 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <DraftInput
                    value={rule.pattern}
                    onCommit={(next) => onChange(replaceRule(rules, index, "pattern", next))}
                    immediate
                    className={inputClass}
                    placeholder="assignment:*"
                  />
                  <DraftInput
                    value={rule.sessionKey}
                    onCommit={(next) => onChange(replaceRule(rules, index, "sessionKey", next))}
                    immediate
                    className={inputClass}
                    placeholder="paperclip:{{paperclipAgentId}}:{{issueId}}"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="text-xs rounded-md border border-border px-2 py-1 hover:bg-accent/50 disabled:opacity-50"
                    onClick={() => onChange(moveRule(rules, index, index - 1))}
                    disabled={index === 0}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="text-xs rounded-md border border-border px-2 py-1 hover:bg-accent/50 disabled:opacity-50"
                    onClick={() => onChange(moveRule(rules, index, index + 1))}
                    disabled={index === rules.length - 1}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs rounded-md border border-border px-2 py-1 hover:bg-accent/50"
                    onClick={() => onChange(deleteRule(rules, index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs rounded-md border border-border px-2 py-1 hover:bg-accent/50"
              onClick={() => onChange(addRule(rules))}
            >
              <Plus className="h-3.5 w-3.5" />
              Add rule
            </button>
          </div>
        )}
      </div>
    </Field>
  );
}
