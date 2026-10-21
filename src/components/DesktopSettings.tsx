// Desktop-only settings: managed-Chrome bridge (with the innocuous self-test
// that writes its result into the CRM), hosted ChatGPT connector, Claude
// executor status, local backups.

import { useEffect, useState } from 'react';
import { Bot, Chrome, Cloud, Play, RefreshCw, Square, Trash2 } from 'lucide-react';
import { desktopApi } from '../lib/desktop';
import type { CloudRelayStatus } from '../lib/desktop';
import { EXECUTOR } from '../lib/executor';
import { APP_VERSION } from '../lib/appVersion';
import { setDockOpen } from '../lib/dockStore';
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
  const [legacyKey, setLegacyKey] = useState(false);
  const [backups, setBackups] = useState<{ file: string; bytes: number }[]>([]);

  useEffect(() => {
    if (!desktop) return;
    void desktop.bridge.status().then((s) => setBridgeRunning(s.running));
    void desktop.legacyKey.status().then((s) => setLegacyKey(s.stored));
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
      <Card data-testid="about-section">
        <CardHeader
          title="Esta versión"
          subtitle="Flujo por lotes con tu ChatGPT Plus: sin APIs de modelos, sin claves, sin servicios de pago."
        />
        <p className="px-5 py-3 text-sm text-slate-700">
          Prospecting Copilot <b data-testid="about-version">v{APP_VERSION}</b> · tus datos se guardan en esta computadora (con copias diarias) y se sincronizan con tu cuenta solo si la conectás.
        </p>
      </Card>

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

      <Card data-testid="executor-section">
        <CardHeader
          title="Ejecutor del navegador (Claude)"
          subtitle="Claude ejecuta los lotes aprobados con Chrome visible, mediante una sesión de suscripción autorizada. No usa la API de Anthropic."
        />
        <div className="space-y-2 px-5 py-4 text-sm">
          <dl className="grid grid-cols-[180px_1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-500">Cuenta</dt>
            <dd>{EXECUTOR.account}</dd>
            <dt className="text-slate-500">Modelo elegido</dt>
            <dd>
              {EXECUTOR.modelName} (<code>{EXECUTOR.modelId}</code>)
            </dd>
            <dt className="text-slate-500">Disponibilidad</dt>
            <dd>{EXECUTOR.availability}</dd>
            <dt className="text-slate-500">Modelo alternativo</dt>
            <dd>{EXECUTOR.fallback}</dd>
          </dl>
          {legacyKey && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Hay una clave de API de Anthropic guardada por una versión anterior. Esta versión no la usa.
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  run('legacykey', async () => {
                    await desktop.legacyKey.delete();
                    setLegacyKey(false);
                    toast('Clave eliminada.', 'info');
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
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
        title="Cuenta en la nube y conector MCP (opcional · uso futuro)"
        subtitle="No hace falta para el flujo por lotes con ChatGPT. Tu plan actual no permite añadir conectores MCP personalizados; el endpoint queda desplegado por si eso cambia."
      />
      <div className="space-y-3 px-5 py-4 text-sm">
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-500" data-testid="cloud-explainer">
          <li><b>Sesión de Supabase</b>: la cuenta con la que esta app guarda datos en la nube. No es el login de ChatGPT.</li>
          <li><b>Enlace del email</b>: abre la web en GitHub Pages, no esta app. Para conectar la app usá el código, o copiá la dirección del enlace y pegala acá sin abrirlo.</li>
          <li><b>URL del conector</b> (abajo): el endpoint MCP. Solo la usaría ChatGPT si algún día tu plan lo permite.</li>
        </ul>
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
                <RefreshCw className="h-3.5 w-3.5" /> Comprobar sesión
              </Button>
              <Button size="sm" variant="ghost" onClick={() => act(async () => void (await desktop.cloud.signOut()))}>
                Desconectar
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDockOpen(true)}>
            <Bot className="h-3.5 w-3.5" /> Probar el panel de ChatGPT integrado (experimental)
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
                <div className="min-w-64 flex-1">
                  <Field label="Código o enlace del email" hint="Si el email trae solo un enlace: clic derecho → copiar dirección del enlace, y pegalo acá. No lo abras.">
                    <Input value={code} onChange={(e) => setCode(e.target.value)} data-testid="cloud-code" />
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

        {!status?.connected && status?.sessionFileReadable === false && (
          <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800" data-testid="session-unreadable">
            Había una sesión guardada pero esta app no pudo leerla (no la modifiqué). Volvé a conectar con un código del email. No se perdió nada del CRM: esta sesión solo sirve para la nube.
          </p>
        )}
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
