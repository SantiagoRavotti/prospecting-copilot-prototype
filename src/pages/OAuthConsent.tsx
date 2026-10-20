// OAuth consent screen for Supabase Auth's OAuth 2.1 server.
//
// ChatGPT (connector, Developer mode) sends the user to Supabase's /authorize,
// which redirects here with ?authorization_id=… (via public/oauth/consent/).
// The user signs in with an emailed one-time code (works inside the app's
// ChatGPT window, where a magic link would open in another browser), sees who
// is asking and for what, and approves or denies. Rendered standalone: it does
// not hydrate the CRM.

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { Button, Card, Input, Spinner } from '../components/ui';

interface Details {
  authorization_id: string;
  redirect_uri: string;
  client: { name?: string; client_name?: string; uri?: string; logo_uri?: string };
  scope?: string;
  user?: { email?: string };
}

export function authorizationIdFromLocation(href: string): string | null {
  const url = new URL(href);
  const fromSearch = url.searchParams.get('authorization_id');
  if (fromSearch) return fromSearch;
  const q = url.hash.split('?')[1];
  return q ? new URLSearchParams(q).get('authorization_id') : null;
}

export default function OAuthConsent() {
  const authorizationId = authorizationIdFromLocation(window.location.href);
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session || !authorizationId) return;
    void supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error: err }) => {
      if (err || !data) {
        setError(err?.message ?? 'No se encontró la solicitud de autorización (¿expiró?).');
        return;
      }
      if (!('authorization_id' in data)) {
        window.location.assign(data.redirect_url); // already consented earlier
        return;
      }
      setDetails(data as unknown as Details);
    });
  }, [session, authorizationId]);

  const shell = (body: React.ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md p-6" data-testid="oauth-consent">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-600" />
          <p className="text-sm font-semibold text-slate-900">Prospecting Copilot — autorizar acceso</p>
        </div>
        {body}
      </Card>
    </div>
  );

  if (!supabase) return shell(<p className="text-sm text-rose-600">Esta página necesita la versión web conectada a Supabase.</p>);
  if (!authorizationId) return shell(<p className="text-sm text-rose-600">Falta authorization_id en la URL.</p>);
  if (checking) return shell(<Spinner label="Comprobando sesión…" />);

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    fn()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  if (!session) {
    return shell(
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Iniciá sesión con tu email. Te enviamos un código por email.</p>
        <Input type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="consent-email" />
        {codeSent && (
          <Input inputMode="numeric" placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} data-testid="consent-code" />
        )}
        {error && <p className="text-xs text-rose-600">{error}</p>}
        {!codeSent ? (
          <Button
            loading={busy}
            disabled={!email.trim()}
            onClick={() =>
              run(async () => {
                const { error: err } = await supabase!.auth.signInWithOtp({
                  email: email.trim(),
                  options: { shouldCreateUser: false, emailRedirectTo: window.location.href },
                });
                if (err) throw err;
                setCodeSent(true);
              })
            }
          >
            Enviar código
          </Button>
        ) : (
          <Button
            loading={busy}
            disabled={code.trim().length < 6}
            onClick={() =>
              run(async () => {
                const { error: err } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
                if (err) throw err;
              })
            }
            data-testid="consent-verify"
          >
            Verificar
          </Button>
        )}
      </div>,
    );
  }

  if (!details) return shell(error ? <p className="text-sm text-rose-600">{error}</p> : <Spinner label="Cargando solicitud…" />);

  const clientName = details.client?.name ?? details.client?.client_name ?? 'Cliente OAuth';
  return shell(
    <div className="space-y-3 text-sm">
      <p>
        <b>{clientName}</b> pide acceso al CRM de Prospecting Copilot de <b>{session.user.email}</b>.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-slate-600">
        <li>Leer campañas, tareas de investigación, personas ya contactadas y conversaciones.</li>
        <li>Guardar candidatos y borradores que vos revisás y aprobás en la app.</li>
        <li>No puede enviar invitaciones ni mensajes.</li>
      </ul>
      <p className="text-xs text-slate-500">
        Volverá a: {details.redirect_uri}
        {details.scope ? ` · alcance: ${details.scope}` : ''}
      </p>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <Button
          loading={busy}
          onClick={() =>
            run(async () => {
              const { data, error: err } = await supabase!.auth.oauth.approveAuthorization(details.authorization_id, {
                skipBrowserRedirect: true,
              });
              if (err) throw err;
              window.location.assign(data.redirect_url);
            })
          }
          data-testid="consent-approve"
        >
          Permitir
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const { data, error: err } = await supabase!.auth.oauth.denyAuthorization(details.authorization_id, {
                skipBrowserRedirect: true,
              });
              if (err) throw err;
              window.location.assign(data.redirect_url);
            })
          }
        >
          Denegar
        </Button>
      </div>
    </div>,
  );
}
