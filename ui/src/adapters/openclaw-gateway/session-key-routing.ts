export type SessionKeyRoutingRule = {
  pattern: string;
  sessionKey: string;
};

export function parseSessionKeyRouting(value: unknown): SessionKeyRoutingRule[] {
  if (!Array.isArray(value)) return [];
  const rules: SessionKeyRoutingRule[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const pattern = typeof (entry as { pattern?: unknown }).pattern === "string"
      ? (entry as { pattern: string }).pattern.trim()
      : "";
    const sessionKey = typeof (entry as { sessionKey?: unknown }).sessionKey === "string"
      ? (entry as { sessionKey: string }).sessionKey.trim()
      : "";
    if (!pattern || !sessionKey) continue;
    rules.push({ pattern, sessionKey });
  }
  return rules;
}

export function parseSessionKeyRoutingJson(text: string): {
  rules: SessionKeyRoutingRule[];
  error: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) return { rules: [], error: null };

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return { rules: [], error: "JSON must be an array of { pattern, sessionKey } objects." };
    }
    return { rules: parseSessionKeyRouting(parsed), error: null };
  } catch {
    return { rules: [], error: "Invalid JSON." };
  }
}
