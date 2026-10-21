// Costs of the services this architecture ACTUALLY uses.
//
// No token math: AI runs on the user's own subscriptions (ChatGPT in the app,
// Claude as browser executor once an account is authorized), not on metered
// APIs. Paid web search is not used. Where a figure cannot be read from the
// service (subscription limits, balances), the page says "no disponible"
// instead of estimating — an estimate is never presented as a bill.

import { Card, CardHeader } from '../components/ui';

interface ServiceRow {
  service: string;
  role: string;
  plan: string;
  cost: string;
  limits: string;
  source: string;
}

const ROWS: ServiceRow[] = [
  {
    service: 'ChatGPT',
    role: 'Asistente: tu conversación dentro de la app, con el conector del CRM',
    plan: 'Plus (tu suscripción existente)',
    cost: 'El de tu suscripción. La app no lo consulta ni lo cobra.',
    limits: 'No disponible: la app no puede leer los límites de uso de tu cuenta.',
    source: 'Declarado por vos',
  },
  {
    service: 'Claude',
    role: 'Ejecutor del navegador (Sonnet 5.5)',
    plan: 'Pendiente: no hay cuenta autorizada. La cuenta Team no se usa.',
    cost: 'No disponible hasta autorizar una cuenta.',
    limits: 'No disponible.',
    source: 'Estado de la configuración',
  },
  {
    service: 'Supabase',
    role: 'Conector MCP alojado, OAuth, relevo de datos (UE, Frankfurt)',
    plan: 'Free',
    cost: '0 €',
    limits:
      'Los del plan Free. El proyecto se pausa tras una semana sin actividad; las plantillas de email no se pueden editar.',
    source: 'Respuestas de la API de Supabase (2026-10-21)',
  },
  {
    service: 'GitHub',
    role: 'Repositorio, página de consentimiento (Pages) y workflows',
    plan: 'Cuenta personal, repositorio público',
    cost: '0 €',
    limits: 'Los de repositorios públicos.',
    source: 'Configuración del repositorio',
  },
];

const NOT_USED = [
  'API de Anthropic (tokens): retirada. El asistente BYOK se eliminó de la app.',
  'API de OpenAI: no se usa. ChatGPT funciona con tu sesión web.',
  'Búsqueda web paga: no se usa ni se habilita como reemplazo.',
  'Proveedores de enriquecimiento o verificación de email: no se usan.',
];

export default function CostEstimator() {
  return (
    <div className="space-y-5" data-testid="costs-page">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Costos</h1>
        <p className="text-sm text-slate-500">
          Servicios que usa la arquitectura actual. Sin estimaciones de tokens: la IA corre sobre tus suscripciones.
        </p>
      </div>

      <Card>
        <CardHeader title="Servicios en uso" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="costs-table">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Servicio</th>
                <th className="px-4 py-2">Para qué</th>
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2">Costo</th>
                <th className="px-4 py-2">Límites / saldo</th>
                <th className="px-4 py-2">Fuente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ROWS.map((r) => (
                <tr key={r.service} className="align-top">
                  <td className="px-4 py-2 font-medium text-slate-900">{r.service}</td>
                  <td className="px-4 py-2 text-slate-600">{r.role}</td>
                  <td className="px-4 py-2 text-slate-600">{r.plan}</td>
                  <td className="px-4 py-2 text-slate-800">{r.cost}</td>
                  <td className="px-4 py-2 text-slate-600">{r.limits}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Retirado del presupuesto" />
        <ul className="list-disc space-y-1 px-9 py-4 text-sm text-slate-600" data-testid="costs-not-used">
          {NOT_USED.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
