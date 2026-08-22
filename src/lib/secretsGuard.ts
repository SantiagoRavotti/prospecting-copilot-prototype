// Secret-hygiene helpers (brief §6 / PRODUCTIZATION_PLAN §9.1).
// Two invariants, enforced in code and by tests:
//   1. The persisted client state never contains provider credentials or any
//      string matching an Anthropic API key (sk-ant-*).
//   2. Nothing matching a secret pattern ever reaches Sentry (see sentry.ts).

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]+/g, // Anthropic API keys
  /sbp_[0-9a-f]{20,}/g, // Supabase access tokens
];

const FORBIDDEN_STATE_KEYS = new Set(['providerCredentials', 'provider_credentials']);

export function redactString(value: string): string {
  let out = value;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

export function containsSecret(value: string): boolean {
  return SECRET_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(value);
  });
}

/** Deep-redact every string in an arbitrary structure; drop forbidden keys. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redactString(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_STATE_KEYS.has(k)) continue;
      out[k] = redactDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Serialize app state for localStorage. Fast path: if the JSON is clean, return
 * it as-is; otherwise strip forbidden keys and redact secret-shaped strings.
 */
export function sanitizeForPersist(state: unknown): string {
  const json = JSON.stringify(state);
  const hasForbiddenKey = [...FORBIDDEN_STATE_KEYS].some((k) => json.includes(`"${k}"`));
  if (!hasForbiddenKey && !containsSecret(json)) return json;
  return JSON.stringify(redactDeep(state));
}
