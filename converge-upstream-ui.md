---
shaping: true
---

# Converge Fork Patches with Upstream UI — Shaping

**Issue:** [#14](https://github.com/ghostwater-ai/paperclip/issues/14)
**Branch strategy:** Based on upstream `main`, suitable for upstream PR.

## Source

> K I'm looking at the UI more closely and it looks like they've already implemented quite a bit of our patches, just in slightly different ways that we might need to extend a tad.
>
> For example: they now have "Payload template json" that appears to be somewhere we can add things like our hardcoded "Openclaw agent ID" instead of hardcoding that. They also have session strategy that we should likely extend with our "rule-based" strategy so that it's very clear this resolves differently than the other options.

> For agent ID, if it's not in the upstream then we can just drop our patch altogether and I'll add it manually to the new config stuff

> We can leave off the project-level routing on this one. Overcomplicating it for something I'm not using yet

---

## Problem

Upstream's OpenClaw Gateway adapter has a Session Strategy dropdown (Fixed / Per issue / Per run) that controls how Paperclip constructs the `sessionKey` sent to OpenClaw. Our fork added a rule-based routing system (pattern matching on `source:reason` with template variables), but it's not represented in the dropdown. The routing rules editor is always visible regardless of strategy selection, and the priority logic (routing rules > strategy) is implicit.

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | Session strategy dropdown includes a "Rule-based" option for routing rules | Core goal |
| R1 | Routing rules editor only visible when "Rule-based" strategy is selected | Must-have |
| R2 | Routing engine evaluates rules only when strategy is "routing" | Must-have |
| R3 | Built on upstream main, no dependency on our patches branch | Must-have |
| R4 | Backward compatible — existing configs without routing rules unaffected | Must-have |

---

## Spike: Upstream SessionKeyStrategy

**Goal:** Understand what to extend on upstream main.

| # | Question | Answer |
|---|----------|--------|
| Q1 | What is the type? | `type SessionKeyStrategy = "fixed" \| "issue" \| "run"` (execute.ts:10) |
| Q2 | What does the normalizer do? | `normalizeSessionKeyStrategy()` defaults to `"issue"`. Accepts `"fixed"` and `"run"` explicitly, everything else → `"issue"`. |
| Q3 | What does resolveSessionKey look like? | Simple function: run → `paperclip:run:${runId}`, issue → `paperclip:issue:${issueId}`, fixed → `configuredSessionKey ?? "paperclip"`. |
| Q4 | Does upstream have routing rules? | No. No `sessionKeyRouting`, no routing editor, no pattern matching. Entirely our feature. |
| Q5 | Does upstream have Agent ID field? | No. That was our patch. Upstream has Payload Template JSON where `agentId` can be set as a key. |
| Q6 | UI dropdown? | Fixed / Per issue / Per run. Session key field shown only for "Fixed". |

---

## A: Add Rule-Based Strategy to Upstream

| Part | Mechanism |
|------|-----------|
| **A1** | **Extend SessionKeyStrategy** — Add `"routing"` to type union. Update `normalizeSessionKeyStrategy()` to accept it. |
| **A2** | **Port routing engine** — Add `resolveSessionKeyFromRouting()`, `matchPattern()`, `interpolateTemplate()` to execute.ts. Called when `strategy === "routing"`. Falls back to `"paperclip"` default if no rule matches. |
| **A3** | **Wire into resolveSessionKey** — When strategy is `"routing"`, call routing engine with wake context (`wakeSource`, `wakeReason`, template variables). Otherwise use existing Fixed/Per issue/Per run logic unchanged. |
| **A4** | **Port RoutingRulesEditor component** — List editor with pattern + session key template fields, reorder controls, add/delete, JSON toggle. |
| **A5** | **Port help modal** — Dialog with pattern reference (sources, reasons, globs), template variable docs. |
| **A6** | **Conditional UI visibility** — Show routing rules editor only when dropdown value is "Rule-based". Hide for all other strategies. |
| **A7** | **Config persistence** — `sessionKeyRouting` stored in adapter config (same level as `sessionKeyStrategy`, `sessionKey`). Array of `{pattern, sessionKey}` objects. |

### Fit Check: R × A

| Req | Requirement | Status | A |
|-----|-------------|--------|---|
| R0 | "Rule-based" option in strategy dropdown | Core goal | ✅ |
| R1 | Routing rules only visible when "Rule-based" selected | Must-have | ✅ |
| R2 | Routing engine evaluates only when strategy is "routing" | Must-have | ✅ |
| R3 | Built on upstream main | Must-have | ✅ |
| R4 | Backward compatible | Must-have | ✅ |

All requirements pass. Single shape — this is straightforward enough that there's no real alternative to compare against. Ready to slice when you say go.
