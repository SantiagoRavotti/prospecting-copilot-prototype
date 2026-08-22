// Mandatory Sprint 1 exit criterion: the persisted client state can NEVER
// contain provider credentials or anything matching an Anthropic API key.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { containsSecret, redactDeep, redactString, sanitizeForPersist } from './secretsGuard';
import { buildDemoState } from '../data/demoData';

// Minimal localStorage shim for the node test environment.
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

// Built via concatenation so secret scanners (GitHub push protection,
// gitleaks) never flag this test fixture as a real credential.
const FAKE_KEY = ['sk-ant', 'api03', 'abc123DEF456ghi789'].join('-');
const FAKE_SBP = 'sbp' + '_' + '0123456789abcdef0123456789abcdef01234567';

describe('redaction primitives', () => {
  it('redacts Anthropic keys and Supabase access tokens from strings', () => {
    expect(redactString(`key=${FAKE_KEY} tok=${FAKE_SBP}`)).toBe('key=[REDACTED] tok=[REDACTED]');
    expect(redactString('nothing secret here')).toBe('nothing secret here');
  });

  it('containsSecret detects both patterns and is repeat-safe', () => {
    expect(containsSecret(FAKE_KEY)).toBe(true);
    expect(containsSecret(FAKE_KEY)).toBe(true); // regex lastIndex reset
    expect(containsSecret('sk-ant')).toBe(false);
    expect(containsSecret('clean')).toBe(false);
  });

  it('redactDeep walks nested structures and drops forbidden keys', () => {
    const input = {
      note: `uses ${FAKE_KEY}`,
      nested: [{ deeper: { value: FAKE_SBP } }],
      providerCredentials: [{ ciphertext: 'x' }],
      provider_credentials: 'y',
      safe: 42,
    };
    const out = redactDeep(input) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/sk-ant-/);
    expect(JSON.stringify(out)).not.toMatch(/sbp_/);
    expect(out.providerCredentials).toBeUndefined();
    expect(out.provider_credentials).toBeUndefined();
    expect(out.safe).toBe(42);
  });
});

describe('persisted client state never contains secrets', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).localStorage = new MemoryStorage();
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('sanitizeForPersist passes clean state through verbatim', () => {
    const state = buildDemoState();
    const json = sanitizeForPersist(state);
    expect(json).toBe(JSON.stringify(state));
  });

  it('strips injected sk-ant-* strings and providerCredentials keys', () => {
    const state = buildDemoState() as unknown as Record<string, unknown>;
    // Simulate the worst case: a secret leaks into a message field and a
    // credentials collection gets attached to the state object.
    (state.prospects as { notes: string }[])[0]!.notes = `my key is ${FAKE_KEY}`;
    state.providerCredentials = [{ provider: 'anthropic', ciphertext: FAKE_KEY }];

    const json = sanitizeForPersist(state);
    expect(json).not.toMatch(/sk-ant-/);
    expect(json).not.toContain('"providerCredentials"');
    expect(json).not.toContain('"provider_credentials"');
    // Non-secret data survives.
    expect(json).toContain('"prospects"');
  });

  it('the store persist path applies the guard end-to-end', async () => {
    const { replaceState, STORAGE_KEY, getState } = await import('./store');
    const dirty = buildDemoState();
    dirty.prospects[0]!.notes = `pasted by accident: ${FAKE_KEY}`;
    replaceState(dirty);

    const persisted = (
      globalThis as unknown as { localStorage: MemoryStorage }
    ).localStorage.getItem(STORAGE_KEY);
    expect(persisted).toBeTruthy();
    expect(persisted!).not.toMatch(/sk-ant-/);
    expect(persisted!).not.toContain('provider_credentials');
    expect(persisted!).not.toContain('providerCredentials');
    // In-memory state is intact for the running session; only persistence is guarded.
    expect(getState().prospects.length).toBeGreaterThan(0);
  });
});
