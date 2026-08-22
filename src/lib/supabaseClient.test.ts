// Magic-link callback classification: PKCE (?code=) must never be confused
// with HashRouter routes, and implicit/error fragments must be recognized.

import { describe, expect, it } from 'vitest';
import { classifyAuthCallback } from './supabaseClient';

const BASE = 'https://santiagoravotti.github.io/prospecting-copilot-prototype/';

describe('classifyAuthCallback', () => {
  it('detects the PKCE code in the query string', () => {
    expect(classifyAuthCallback(`${BASE}?code=abc-123`)).toBe('pkce_code');
    expect(classifyAuthCallback(`${BASE}?code=abc-123#/dashboard`)).toBe('pkce_code');
  });

  it('never confuses HashRouter routes with auth callbacks', () => {
    expect(classifyAuthCallback(`${BASE}#/dashboard`)).toBe('none');
    expect(classifyAuthCallback(`${BASE}#/today`)).toBe('none');
    expect(classifyAuthCallback(`${BASE}#/opportunities`)).toBe('none');
    expect(classifyAuthCallback(BASE)).toBe('none');
  });

  it('recognizes implicit-flow fragments', () => {
    expect(classifyAuthCallback(`${BASE}#access_token=eyJ&refresh_token=xyz&type=magiclink`)).toBe(
      'implicit_fragment',
    );
  });

  it('recognizes error fragments (expired/invalid links)', () => {
    expect(classifyAuthCallback(`${BASE}#error=access_denied&error_code=otp_expired`)).toBe(
      'error_fragment',
    );
  });

  it('tolerates malformed URLs', () => {
    expect(classifyAuthCallback('not a url')).toBe('none');
  });
});
