// Desktop-only settings: managed-Chrome bridge (with the innocuous self-test
// that writes its result into the CRM), Anthropic BYOK key, local backups.

import { useEffect, useState } from 'react';
import { Bot, Chrome, Cloud, KeyRound, Play, RefreshCw, ShieldCheck, Square, Trash2 } from 'lucide-react';
import { desktopApi } from '../lib/desktop';
import type { CloudRelayStatus } from '../lib/desktop';
import { appendBridgeLog, useAppState } from '../lib/store';
import { formatDateTime } from '../lib/utils';
import { Badge, Button, Card, CardHeader, Field, Input } from './ui';
import { useToast } from './toast';

export default function DesktopSettings() {
  const desktop = desktopApi();
  const state = useAppState();
  const { toast } = useToast();
  const [bridgeRunning, setBridgeRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<{ stored: boolean; last4: string | null }>({
    stored: false,
    last4: null,
  });
  const [keyDraft, setKeyDraft] = useState('');
  const [backups, setBackups] = useState<{ file: string; bytes: number }[]>([]);

  useEffect(() => {
    if (!desktop) return;
    void desktop.bridge.status().then((s) => setBridgeRunning(s.running));
    void desktop.secrets.anthropicKeyStatus().then(setKeyStatus);
    void desktop.listBackups().then(setBackups);
  }, [desktop]);

  if (!desktop) return null;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : `${label} failed.`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Puente con Chrome (escritorio)"
          subtitle="Chrome gestionado con perfil propio de la app. Solo lectura y navegación — enviar es siempre humano."
        />
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={
                bridgeRunning
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500'
              }
            >
              {bridgeRunning ? 'Chrome gestionado: corriendo' : 'Chrome gestionado: detenido'}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              loading={busy === 'launch'}
              onClick={() =>
                run('launch', async () => {
                  await desktop.bridge.launch('https://www.linkedin.com/feed/');
                  setBridgeRunning(true);
                  toast(
                    'Chrome gestionado lanzado. Logueate a LinkedIn ahí una sola vez.',
                    'success',
                  );
                })
              }
              data-testid="bridge-launch"
            >
              <Chrome className="h-3.5 w-3.5" /> Lanzar Chrome gestionado
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={busy === 'stop'}
              onClick={() =>
                run('stop', async () => {
                  await desktop.bridge.stop();
                  setBridgeRunning(false);
                })
              }
            >
              <Square className="h-3.5 w-3.5" /> Detener
            </Button>
            <Button
              size="sm"
              loading={busy === 'selftest'}
              onClick={() =>
                run('selftest', async () => {
                  const r = await desktop.bridge.selfTest();
                  setBridgeRunning(true);
                  appendBridgeLog({
                    at: r.readAt,
                    url: r.url,
                    title: r.title,
                    snippet: r.textSnippet,
                    ok: r.ok,
                  });
                  toast(
                    r.ok
                      ? `Puente OK: leí “${r.title}” y lo registré en el CRM.`
                      : 'El puente respondió pero sin contenido legible.',
                    r.ok ? 'success' : 'error',
                  );
                })
              }
              data-testid="bridge-selftest"
            >
              <Play className="h-3.5 w-3.5" /> Probar puente (prueba inocua)
            </Button>
          </div>

          {(state.bridgeLog ?? []).length > 0 && (
            <div data-testid="bridge-log">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Registro de pruebas del puente (guardado en el CRM)
              </p>
              <ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-slate-600">
                {(state.bridgeLog ?? []).map((b, i) => (
                  <li key={i} className="rounded border border-slate-100 px-2 py-1">
                    <span className={b.ok ? 'text-emerald-600' : 'text-rose-600'}>
                      {b.ok ? '✓' : '✗'}
                    </span>{' '}
                    {formatDateTime(b.at)} — <strong>{b.title || '(sin título)'}</strong>{' '}
                    <span className="text-slate-400">({b.url})</span>
                    {b.snippet && (
                      <span className="block text-slate-400">“{b.snippet.slice(0, 120)}…”</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      <CloudConnectorSection />

      <Card>
        <CardHeader
          title="Clave de Anthropic (BYOK)"
          subtitle="Se cifra con el almacenamiento seguro del sistema. Nunca se guarda en texto plano ni sale de tu máquina salvo hacia la API de Anthropic."
        />
        <div className="space-y-3 px-5 py-4">
          {keyStatus.stored ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-3 w-3" /> Clave guardada (···{keyStatus.last4})
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  run('clearkey', async () => {
                    await desktop.secrets.clearAnthropicKey();
                    setKeyStatus({ stored: false, last4: null });
                    toast('Clave eliminada.', 'info');
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" /> Eliminar clave
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1">
                <Field
                  label="API key"
                  hint="console.anthropic.com → API Keys. Configurá antes un límite de gasto en TU consola."
                >
                  <Input
                    type="password"
                    placeholder="sk-ant-…"
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    data-testid="anthropic-key-input"
                  />
                </Field>
              </div>
              <Button
                loading={busy === 'setkey'}
                disabled={!keyDraft.trim()}
                onClick={() =>
                  run('setkey', async () => {
                    const r = await desktop.secrets.setAnthropicKey(keyDraft.trim());
                    setKeyStatus({ stored: true, last4: r.last4 });
                    setKeyDraft('');
                    toast('Clave guardada cifrada.', 'success');
                  })
                }
                data-testid="anthropic-key-save"
              >
                <KeyRound className="h-4 w-4" /> Guardar
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Datos locales"
          subtitle="Estado en archivo local con backup diario automático (se conservan 14)."
        />
        <div className="px-5 py-4">
          {backups.length === 0 ? (
            <p className="text-sm text-slate-400">
              Todavía no hay backups (se crea uno por día de uso).
            </p>
          ) : (
            <ul className="space-y-0.5 text-xs text-slate-500">
              {backups.map((b) => (
                <li key={b.file}>
                  {b.file} — {(b.bytes / 1024).toFixed(1)} KB
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}

/**
 * ChatGPT connector (hosted). ChatGPT talks to the Supabase Edge Function
 * crm-mcp with an OAuth token from Supabase Auth; this app signs in as the
 * same user (email code), publishes the read snapshot and applies the writes.
 */
function CloudConnectorSection() {
  const desktop = desktopApi();
  const { toast } = useToast();
  const [status, setStatus] = useState<CloudRelayStatus | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!desktop) return;
    setStatus(await desktop.cloud.status());
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!desktop) return null;
  const act = (fn: () => Promise<void>) => {
    setBusy(true);
    fn()
      .catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error'))
      .finally(() => {
        setBusy(false);
        void refresh();
      });
  };

  return (
    <Card data-testid="cloud-connector-section">
      <CardHeader
        title="ChatGPT ↔ CRM (conector alojado)"
        subtitle="ChatGPT usa el endpoint en Supabase (UE) con OAuth: solo accede después de que inicies sesión y apruebes. Esta app aplica lo que ChatGPT guarda; nada se envía a LinkedIn."
      />
      <div className="space-y-3 px-5 py-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={
              status?.connected
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }
          >
            <Cloud className="h-3 w-3" /> {status?.connected ? `Conectado como ${status.email}` : 'Sin conectar'}
          </Badge>
          {status?.connected && (
            <>
              <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                Snapshot {status.lastPushAt ? formatDateTime(status.lastPushAt) : '—'} · aplicadas {status.applied} · fallidas {status.failed}
              </Badge>
              <Button size="sm" variant="ghost" loading={busy} onClick={() => act(async () => void (await desktop.cloud.syncNow()))}>
                <RefreshCw className="h-3.5 w-3.5" /> Sincronizar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => act(async () => void (await desktop.cloud.signOut()))}>
                Desconectar
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => void desktop.chatgpt.open()}>
            <Bot className="h-3.5 w-3.5" /> Abrir ChatGPT en la app
          </Button>
        </div>

        {!status?.connected && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <Field label="Email de tu cuenta" hint="Te llega un código por email. Sin contraseña.">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="cloud-email" />
              </Field>
            </div>
            {!codeSent ? (
              <Button
                loading={busy}
                disabled={!email.trim()}
                onClick={() =>
                  act(async () => {
                    await desktop.cloud.sendCode(email);
                    setCodeSent(true);
                    toast('Código enviado.', 'success');
                  })
                }
                data-testid="cloud-send-code"
              >
                Enviar código
              </Button>
            ) : (
              <>
                <div className="w-36">
                  <Field label="Código">
                    <Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} data-testid="cloud-code" />
                  </Field>
                </div>
                <Button
                  loading={busy}
                  disabled={code.trim().length < 6}
                  onClick={() =>
                    act(async () => {
                      await desktop.cloud.verifyCode(email, code);
                      setCode('');
                      setCodeSent(false);
                      toast('Cuenta conectada.', 'success');
                    })
                  }
                  data-testid="cloud-verify"
                >
                  Verificar
                </Button>
              </>
            )}
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">URL del conector para ChatGPT</p>
          <code className="mt-1 block break-all rounded bg-slate-100 px-2 py-1 text-xs" data-testid="connector-url">
            {status?.connectorUrl ?? '…'}
          </code>
          <p className="mt-1 text-xs text-slate-500">
            ChatGPT → Settings → Apps &amp; Connectors → Advanced → Developer mode → Create. Autenticación: OAuth.
          </p>
        </div>

        {status?.lastError && <p className="text-xs text-rose-600">Último error: {status.lastError}</p>}
        {status?.lastApplied.length ? (
          <ul className="max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2 text-xs" data-testid="relay-log">
            {status.lastApplied.map((a, i) => (
              <li key={i} className={a.error ? 'text-rose-700' : 'text-slate-700'}>
                {formatDateTime(a.at)} · <b>{a.tool}</b> {a.error ?? JSON.stringify(a.result).slice(0, 160)}
              </li>
            ))}
          </ul>
        ) : null}
        {status && !status.encryptionAvailable && (
          <p className="text-xs text-amber-700">El cifrado del sistema no está disponible: la sesión no se guardará entre reinicios.</p>
        )}
      </div>
    </Card>
  );
}
