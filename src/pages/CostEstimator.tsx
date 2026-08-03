// Interactive future-cost estimator. All math is local (src/lib/costModel.ts)
// against src/data/pricing.json. No live pricing APIs are called.

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import {
  BUDGET_LIMIT_EUR,
  DEFAULT_ASSUMPTIONS,
  estimateCosts,
  PRICING,
  type CostAssumptions,
} from '../lib/costModel';
import { formatEur } from '../lib/utils';
import { Button, Card, CardHeader, Field, Input, Select } from '../components/ui';

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  hint,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  hint?: string;
  testId?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number.parseFloat(e.target.value) || 0)}
        data-testid={testId}
      />
    </Field>
  );
}

function CostRow({ label, value, isDriver }: { label: string; value: number; isDriver: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="flex items-center gap-1.5 text-sm text-slate-600">
        {label}
        {isDriver && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
            main driver
          </span>
        )}
      </span>
      <span className="text-sm font-medium text-slate-800">{formatEur(value)}</span>
    </div>
  );
}

export default function CostEstimator() {
  const [a, setA] = useState<CostAssumptions>(DEFAULT_ASSUMPTIONS);
  const result = useMemo(() => estimateCosts(a), [a]);

  const set = <K extends keyof CostAssumptions>(key: K, value: CostAssumptions[K]) =>
    setA((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Cost Estimator</h1>
        <Button variant="ghost" size="sm" onClick={() => setA(DEFAULT_ASSUMPTIONS)}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
        </Button>
      </div>
      <p className="mb-5 text-sm text-slate-500">
        Models the future monthly operating cost of a live MVP (the prototype itself costs €0).
      </p>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Assumptions */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Research volume" />
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
              <NumberField
                label="Research runs per month"
                value={a.runsPerMonth}
                onChange={(v) => set('runsPerMonth', v)}
                testId="cost-runs"
              />
              <NumberField
                label="Candidates per run"
                value={a.candidatesPerRun}
                onChange={(v) => set('candidatesPerRun', v)}
                testId="cost-candidates"
              />
              <NumberField
                label="Search requests per candidate"
                value={a.searchesPerCandidate}
                onChange={(v) => set('searchesPerCandidate', v)}
                step={0.1}
                hint="Company-level caching keeps this below 2."
              />
              <div className="flex items-end pb-1 text-sm text-slate-500">
                = {result.candidatesPerMonth.toLocaleString()} candidates/month
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="AI usage"
              subtitle={`${PRICING.aiModels.low.label} + ${PRICING.aiModels.capable.label}`}
            />
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
              <NumberField
                label="Avg input tokens per candidate"
                value={a.inputTokensPerCandidate}
                onChange={(v) => set('inputTokensPerCandidate', v)}
                step={500}
              />
              <NumberField
                label="Avg output tokens per candidate"
                value={a.outputTokensPerCandidate}
                onChange={(v) => set('outputTokensPerCandidate', v)}
                step={100}
              />
              <NumberField
                label="% with low-cost model"
                value={a.lowCostModelPercent}
                onChange={(v) => set('lowCostModelPercent', Math.min(100, v))}
              />
              <NumberField
                label="% with capable model"
                value={a.capableModelPercent}
                onChange={(v) => set('capableModelPercent', Math.min(100, v))}
                testId="cost-capable-percent"
              />
              <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={a.useBatchApi}
                  onChange={(e) => set('useBatchApi', e.target.checked)}
                />
                Use Batch API (50% discount, overnight processing)
              </label>
            </div>
          </Card>

          <Card>
            <CardHeader title="Infrastructure & enrichment" />
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
              <Field label="Database plan">
                <Select
                  value={a.databasePlanId}
                  onChange={(e) => set('databasePlanId', e.target.value)}
                  data-testid="cost-database"
                >
                  {PRICING.databasePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Hosting plan">
                <Select
                  value={a.hostingPlanId}
                  onChange={(e) => set('hostingPlanId', e.target.value)}
                >
                  {PRICING.hostingPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Email enrichment provider">
                <Select
                  value={a.enrichmentProviderId}
                  onChange={(e) => set('enrichmentProviderId', e.target.value)}
                  data-testid="cost-enrichment"
                >
                  {PRICING.enrichmentProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <NumberField
                label="Email verifications per month"
                value={a.emailVerificationsPerMonth}
                onChange={(v) => set('emailVerificationsPerMonth', v)}
              />
              <NumberField
                label="Safety margin %"
                value={a.safetyMarginPercent}
                onChange={(v) => set('safetyMarginPercent', v)}
                hint="Recommended: 15–20% contingency."
              />
            </div>
          </Card>
        </div>

        {/* Results */}
        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader
              title="Estimated monthly cost"
              subtitle={`Budget target: ${formatEur(BUDGET_LIMIT_EUR)}`}
            />
            <div className="px-5 py-4">
              {result.overBudget ? (
                <div
                  className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3"
                  data-testid="budget-warning"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <p className="text-sm text-rose-700">
                    Estimate exceeds the {formatEur(BUDGET_LIMIT_EUR)} monthly budget by{' '}
                    <strong>{formatEur(result.totalEur - BUDGET_LIMIT_EUR)}</strong>.
                  </p>
                </div>
              ) : (
                <div
                  className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3"
                  data-testid="budget-ok"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="text-sm text-emerald-700">
                    Within budget — {formatEur(result.budgetRemainingEur)} remaining.
                  </p>
                </div>
              )}

              <p className="text-3xl font-bold text-slate-900" data-testid="cost-total">
                {formatEur(result.totalEur)}
              </p>
              <p className="text-xs text-slate-400">
                {formatEur(result.costPerCandidateEur)} per candidate ·{' '}
                {result.candidatesPerMonth.toLocaleString()} candidates/month
              </p>

              <div className="mt-4 divide-y divide-slate-50 border-t border-slate-100">
                <CostRow
                  label="AI (Anthropic)"
                  value={result.aiEur}
                  isDriver={result.mainDriver === 'AI (Anthropic)'}
                />
                <CostRow
                  label="Web search"
                  value={result.searchEur}
                  isDriver={result.mainDriver === 'Web search'}
                />
                <CostRow
                  label="Database"
                  value={result.databaseEur}
                  isDriver={result.mainDriver === 'Database'}
                />
                <CostRow
                  label="Hosting"
                  value={result.hostingEur}
                  isDriver={result.mainDriver === 'Hosting'}
                />
                <CostRow
                  label="Email enrichment"
                  value={result.enrichmentEur}
                  isDriver={result.mainDriver === 'Email enrichment'}
                />
                <div className="flex items-center justify-between py-1.5 text-sm text-slate-500">
                  <span>Safety margin ({a.safetyMarginPercent}%)</span>
                  <span>{formatEur(result.marginEur)}</span>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Suggestions to reduce cost
                </p>
                <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs text-slate-600">
                  {result.suggestions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            Pricing estimates must be verified before production implementation. Unit prices come
            from a local configuration file checked on {PRICING.checkedAt} (1 USD ≈ €
            {PRICING.usdToEur}); no live pricing API is called.
          </p>
        </div>
      </div>
    </div>
  );
}
