// Cloud-mode gate: magic-link auth, PKCE callback handling (HashRouter-safe),
// hydration, and first-login onboarding (import backup / create workspace).
// In local mode it renders children untouched — the prototype behavior.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react';
import { CloudOff, LogIn, Upload } from 'lucide-react';
import {
  classifyAuthCallback,
  cleanAuthCallbackFromUrl,
  isCloudMode,
  publicRedirectUrl,
  supabase,
} from '../lib/supabaseClient';
import { startSync, stopSync, createWorkspaceCloud } from '../lib/sync/engine';
import { importBackupToCloud, type BackupImportResult } from '../lib/backupImport';
import { useAppState } from '../lib/store';
import { Button, Card, Input, Spinner } from './ui';
import { useToast } from './toast';

type Phase = 'checking' | 'signed_out' | 'hydrating' | 'ready' | 'error';

export default function AuthGate({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('checking');
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [wsName, setWsName] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importSummary, setImportSummary] = useState<BackupImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const startedFor = useRef<string | null>(null);
  const state = useAppState();

  const beginSession = useCallback(async (s: Session) => {
    if (startedFor.current === s.user.id) return;
    startedFor.current = s.user.id;
    setPhase('hydrating');
    try {
      await startSync(s.user.id);
      setPhase('ready');
    } catch (e) {
      // Surface the real cause: Supabase errors are not always Error instances.
      const message =
        (e instanceof Error && e.message) ||
        (typeof e === 'object' &&
          e !== null &&
          'message' in e &&
          String((e as { message: unknown }).message)) ||
        'Could not load your data.';
      console.error('[AuthGate] hydration failed:', e);
      Sentry.captureException(e instanceof Error ? e : new Error(message));
      startedFor.current = null; // allow Retry without a full reload
      setErrorMsg(message);
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (!isCloudMode() || !supabase) return;

    // Consume implicit-flow fragments (#access_token / #error) before the
    // HashRouter can interpret them; PKCE (?code=) is handled by supabase-js
    // via detectSessionInUrl, we only clean the URL afterwards.
    const kind = classifyAuthCallback(window.location.href);
    if (kind === 'error_fragment') {
      setErrorMsg('The sign-in link is invalid or has expired. Request a new one.');
      cleanAuthCallbackFromUrl();
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        cleanAuthCallbackFromUrl();
        // CRITICAL: defer out of this callback. supabase-js holds its internal
        // auth lock while dispatching events; hydration awaits `from()` calls
        // that re-acquire that lock, which deadlocks/times out on the
        // magic-link SIGNED_IN event (fired inside exchangeCodeForSession).
        // Password/restored sessions don't hit this path — which is why the
        // bug only appeared on real magic-link logins.
        setTimeout(() => void beginSession(s), 0);
      } else {
        startedFor.current = null;
        stopSync();
        setPhase('signed_out');
      }
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void beginSession(data.session);
      else setPhase('signed_out');
    });
    return () => sub.subscription.unsubscribe();
  }, [beginSession]);

  if (!isCloudMode()) return <>{children}</>;

  const sendLink = async () => {
    if (!supabase || !email.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: publicRedirectUrl() },
      });
      if (error) throw error;
      setLinkSent(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not send the link.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const importBackup = (file: File) => {
    if (!session) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      try {
        const parsed: unknown = JSON.parse(String(reader.result ?? ''));
        const summary = await importBackupToCloud(parsed, session.user.id);
        setImportSummary(summary);
        toast(
          `Imported ${summary.prospects} prospects and ${summary.opportunities} opportunities.`,
          'success',
        );
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Import failed.', 'error');
      } finally {
        setBusy(false);
      }
    };
    reader.readAsText(file);
  };

  const shell = (content: ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            PC
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Prospecting Copilot</p>
            <p className="text-[11px] text-slate-400">EU region · your data stays yours</p>
          </div>
        </div>
        {content}
      </Card>
    </div>
  );

  if (phase === 'checking') return shell(<Spinner label="Checking session…" />);

  if (phase === 'error')
    return shell(
      <div data-testid="auth-error">
        <p className="flex items-center gap-2 text-sm text-rose-600">
          <CloudOff className="h-4 w-4" /> {errorMsg}
        </p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>,
    );

  if (phase === 'signed_out')
    return shell(
      linkSent ? (
        <div data-testid="link-sent">
          <p className="text-sm font-medium text-slate-800">Check your inbox</p>
          <p className="mt-1 text-sm text-slate-500">
            We sent a sign-in link to <strong>{email}</strong>. Open it on this device.
          </p>
          <Button variant="ghost" size="sm" className="mt-4" onClick={() => setLinkSent(false)}>
            Use another email
          </Button>
        </div>
      ) : (
        <form
          data-testid="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            void sendLink();
          }}
        >
          <p className="mb-1 text-sm font-medium text-slate-800">Sign in</p>
          <p className="mb-3 text-sm text-slate-500">
            Magic link — no password. Accounts are invite-only.
          </p>
          {errorMsg && <p className="mb-2 text-xs text-rose-600">{errorMsg}</p>}
          <Input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="login-email"
          />
          <Button type="submit" className="mt-3 w-full" loading={busy} data-testid="login-send">
            <LogIn className="h-4 w-4" /> Send magic link
          </Button>
        </form>
      ),
    );

  if (phase === 'hydrating') return shell(<Spinner label="Loading your workspaces…" />);

  // Ready but no workspace yet → first-login onboarding.
  if (state.workspaces.length === 0)
    return shell(
      <div data-testid="onboarding">
        <p className="text-sm font-medium text-slate-800">Welcome!</p>
        <p className="mt-1 text-sm text-slate-500">Create your first workspace to get started.</p>
        {importSummary == null ? (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!session || wsName.trim() === '') return;
                setBusy(true);
                createWorkspaceCloud(wsName.trim(), session.user.id)
                  .catch((err: unknown) =>
                    toast(
                      err instanceof Error ? err.message : 'Could not create workspace.',
                      'error',
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              <Input
                className="mt-4"
                placeholder="Workspace name (e.g. Impact Hydrogen)"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                data-testid="onboarding-ws-name"
              />
              <Button
                type="submit"
                className="mt-2 w-full"
                loading={busy}
                data-testid="onboarding-create"
              >
                Create workspace
              </Button>
            </form>

            {/* Secondary, tucked away: returning prototype users only. */}
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importBackup(f);
                e.target.value = '';
              }}
            />
            {showImport ? (
              <Button
                className="mt-5 w-full"
                variant="outline"
                size="sm"
                loading={busy}
                onClick={() => fileRef.current?.click()}
                data-testid="onboarding-import"
              >
                <Upload className="h-3.5 w-3.5" /> Elegir el archivo exportado
              </Button>
            ) : (
              <button
                type="button"
                className="mt-5 w-full text-center text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
                onClick={() => setShowImport(true)}
                data-testid="onboarding-import-link"
              >
                ¿Usabas la versión anterior? Importá tus datos
              </button>
            )}
          </>
        ) : (
          <Spinner label="Finishing import…" />
        )}
      </div>,
    );

  return <>{children}</>;
}
