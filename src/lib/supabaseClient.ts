// Supabase client (cloud mode) — created only when build-time env vars exist.
// Without them the app runs in the original local/demo mode, unchanged.
//
// Magic link × HashRouter: we use the PKCE flow, so the auth callback arrives
// in the QUERY STRING (?code=...) and never collides with HashRouter's #/route.
// classifyAuthCallback() additionally recognizes implicit-flow fragments
// (#access_token=... / #error=...) so they can be consumed and cleaned before
// the router interprets them.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const forceLocal = (import.meta.env.VITE_FORCE_LOCAL as string | undefined) === '1';

export function isCloudMode(): boolean {
  return !forceLocal && Boolean(url && anonKey);
}

export const supabase: SupabaseClient | null = isCloudMode()
  ? createClient(url!, anonKey!, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

/** The exact public URL magic-link emails must redirect to. */
export function publicRedirectUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  if (configured) return configured;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return 'https://santiagoravotti.github.io/prospecting-copilot-prototype/';
}

export type AuthCallbackKind = 'pkce_code' | 'implicit_fragment' | 'error_fragment' | 'none';

/**
 * Classify what kind of Supabase auth callback (if any) a URL contains.
 * Pure function — unit tested against HashRouter URLs.
 */
export function classifyAuthCallback(href: string): AuthCallbackKind {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return 'none';
  }
  if (parsed.searchParams.has('code')) return 'pkce_code';
  const hash = parsed.hash.replace(/^#/, '');
  // Only auth fragments — never confuse HashRouter routes like #/dashboard.
  if (/^(access_token|refresh_token|type=)/.test(hash)) return 'implicit_fragment';
  if (/^error(_code|_description)?=/.test(hash)) return 'error_fragment';
  return 'none';
}

/** Remove auth artifacts (?code=... or auth fragments) from the address bar. */
export function cleanAuthCallbackFromUrl(): void {
  if (typeof window === 'undefined') return;
  const kind = classifyAuthCallback(window.location.href);
  if (kind === 'none') return;
  const clean = `${window.location.origin}${window.location.pathname}#/`;
  window.history.replaceState(null, '', clean);
}
