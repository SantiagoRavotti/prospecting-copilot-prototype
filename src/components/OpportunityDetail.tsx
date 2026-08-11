// Executive record of an opportunity (§13 of the module spec) plus the
// delivery-cost estimate linked to the opportunity budget.
// Unknown fields display "Not available" — the prototype never invents data.

import { useState } from 'react';
import { Calculator, Copy, Download, ExternalLink } from 'lucide-react';
import type { Opportunity } from '../lib/opportunityTypes';
import { DEFAULT_DELIVERY_INPUT, estimateDelivery } from '../lib/deliveryEstimate';
import { MATCH_LEVEL_LABELS, daysUntil } from '../lib/opportunityScoring';
import { OPPORTUNITY_STATUS_LABELS } from '../lib/labels';
import { OPPORTUNITY_STATUSES } from '../lib/opportunityTypes';
import { OPPORTUNITY_TYPE_LABELS } from '../lib/opportunityTypes';
import { changeOpportunityStatus, updateOpportunity } from '../lib/store';
import { copyToClipboard, formatDate, formatDateTime, formatEur, nowIso } from '../lib/utils';
import { Badge, Button, Dialog, Field, Input, Select, Textarea } from './ui';
import { exportOpportunitiesXlsx } from '../lib/exporters';
import { useToast } from './toast';
import { MatchBadge } from './OpportunityCard';

const NA = <span className="text-slate-400">Not available</span>;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value ?? NA}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-5 border-b border-slate-100 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 first:mt-0">
      {children}
    </h3>
  );
}

function ListOrNA({ items }: { items: string[] }) {
  if (items.length === 0) return NA;
  return (
    <ul className="list-inside list-disc space-y-0.5">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

export default function OpportunityDetail({
  opportunity,
  onClose,
}: {
  opportunity: Opportunity;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const o = opportunity;
  const [noteDraft, setNoteDraft] = useState(o.notes);
  const [assigneeDraft, setAssigneeDraft] = useState(o.assignee ?? '');
  const [estimateOpen, setEstimateOpen] = useState(o.deliveryEstimate != null);
  const [estimateInput, setEstimateInput] = useState(
    o.deliveryEstimate?.input ?? DEFAULT_DELIVERY_INPUT,
  );

  const days = daysUntil(o.deadline);
  const budget = o.budgetMaxEur ?? null;
  const estimateResult = estimateDelivery(estimateInput, budget);

  const saveEstimate = () => {
    updateOpportunity(
      o.id,
      { deliveryEstimate: { input: estimateInput, result: estimateResult, updatedAt: nowIso() } },
      'Delivery cost estimate updated.',
    );
    toast('Delivery estimate saved to the opportunity.', 'success');
  };

  const copySummary = async () => {
    const text = [
      o.title,
      `${o.organization} · ${o.country} · deadline ${o.deadline ? formatDate(o.deadline) : 'not available'}`,
      '',
      o.summary,
      '',
      `Match: ${o.score}% — ${MATCH_LEVEL_LABELS[o.matchLevel]}`,
      ...o.matchFactors.map((f) => `- ${f.label}: ${f.points}/${f.max} — ${f.reason}`),
    ].join('\n');
    const ok = await copyToClipboard(text);
    toast(ok ? 'Executive summary copied.' : 'Clipboard unavailable.', ok ? 'success' : 'error');
  };

  const numField = (label: string, key: keyof typeof estimateInput, step = 1): React.ReactNode => (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        step={step}
        value={estimateInput[key]}
        onChange={(e) =>
          setEstimateInput((prev) => ({
            ...prev,
            [key]: Number.parseFloat(e.target.value) || 0,
          }))
        }
      />
    </Field>
  );

  return (
    <Dialog open onClose={onClose} title={o.title} wide>
      <div data-testid="opportunity-detail">
        {/* Header badges */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <MatchBadge score={o.score} level={o.matchLevel} />
          <Badge className="border-slate-200 bg-slate-50 text-slate-600">
            {OPPORTUNITY_TYPE_LABELS[o.type]}
          </Badge>
          <Badge className="border-slate-200 bg-slate-50 text-slate-600">
            {OPPORTUNITY_STATUS_LABELS[o.status]}
          </Badge>
          {o.isDemo && (
            <Badge className="border-dashed border-slate-300 bg-slate-50 text-slate-500">
              Demo opportunity — fictional data
            </Badge>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={copySummary}>
              <Copy className="h-3.5 w-3.5" /> Copy summary
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportOpportunitiesXlsx([o], 'opportunity.xlsx')}
            >
              <Download className="h-3.5 w-3.5" /> XLSX
            </Button>
            {o.url && (
              <a href={o.url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5" /> Source
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* 1. Executive summary */}
        <SectionTitle>Executive summary</SectionTitle>
        <p className="text-sm leading-relaxed text-slate-700">{o.summary}</p>
        <p className="mt-1 text-[11px] text-slate-400">
          Prototype analysis — simulated, no live AI. Found {formatDate(o.foundAt)} · last checked{' '}
          {formatDate(o.lastCheckedAt)}.
        </p>

        {/* 2. Client */}
        <SectionTitle>Client</SectionTitle>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Row label="Contracting organization" value={o.organization} />
          <Row label="Funder" value={o.funder} />
          <Row label="Programme" value={o.program} />
          <Row label="Reference" value={o.reference} />
          <Row label="Country / region" value={`${o.country}${o.region ? ` · ${o.region}` : ''}`} />
          <Row label="Language" value={o.language} />
        </dl>

        {/* 3–4. Scope & deliverables */}
        <SectionTitle>Scope of work & deliverables</SectionTitle>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row label="Scope" value={o.scopeOfWork ?? o.summary} />
          <Row label="Deliverables" value={<ListOrNA items={o.deliverables} />} />
        </dl>

        {/* 5–6. Eligibility & experts */}
        <SectionTitle>Eligibility & expert profiles</SectionTitle>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row
            label="Requirements"
            value={
              <ul className="list-inside list-disc space-y-0.5">
                <li>Consortium required: {o.eligibility.consortiumRequired ? 'Yes' : 'No'}</li>
                <li>Local partner required: {o.eligibility.localPartnerRequired ? 'Yes' : 'No'}</li>
                <li>
                  Min. turnover:{' '}
                  {o.eligibility.minAnnualTurnoverEur
                    ? formatEur(o.eligibility.minAnnualTurnoverEur)
                    : 'Not available'}
                </li>
                <li>Min. references: {o.eligibility.minReferences ?? 'Not available'}</li>
                <li>
                  Required languages:{' '}
                  {o.eligibility.requiredLanguages?.join(', ') ?? 'Not available'}
                </li>
              </ul>
            }
          />
          <Row label="Expert profiles" value={<ListOrNA items={o.expertProfiles} />} />
        </dl>

        {/* 7–8. Budget & dates */}
        <SectionTitle>Budget & key dates</SectionTitle>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Row
            label="Budget"
            value={
              o.budgetMaxEur
                ? `${o.budgetMinEur ? `${formatEur(o.budgetMinEur)} – ` : 'up to '}${formatEur(o.budgetMaxEur)}`
                : undefined
            }
          />
          <Row label="Published" value={o.publishedAt ? formatDate(o.publishedAt) : undefined} />
          <Row
            label="Deadline"
            value={
              o.deadline
                ? `${formatDate(o.deadline)}${days != null ? ` (${days < 0 ? 'closed' : `${days} days left`})` : ''}`
                : undefined
            }
          />
          <Row
            label="Questions deadline"
            value={o.questionsDeadline ? formatDate(o.questionsDeadline) : undefined}
          />
          <Row label="Expected start" value={o.startDate ? formatDate(o.startDate) : undefined} />
          <Row
            label="Duration"
            value={o.durationMonths ? `${o.durationMonths} months` : undefined}
          />
        </dl>

        {/* 9–10. Procedure & documents */}
        <SectionTitle>Procedure & documents</SectionTitle>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row label="Procedure" value={o.procedure} />
          <Row label="Evaluation criteria" value={o.evaluationCriteria} />
          <Row
            label="Documents"
            value={
              o.documents.length > 0 ? (
                <ul className="space-y-0.5">
                  {o.documents.map((d) => (
                    <li key={d.url}>
                      <a
                        className="text-brand-600 hover:underline"
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {d.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : undefined
            }
          />
          <Row label="Source" value={o.sourceName} />
        </dl>

        {/* 11. Match analysis */}
        <SectionTitle>Match analysis (demo score)</SectionTitle>
        <p className="mb-2 text-sm text-slate-700">{o.relevanceRationale}</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {o.matchFactors.map((f) => (
            <div key={f.key} className="rounded-lg border border-slate-100 px-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{f.label}</span>
                <span className="font-semibold text-slate-600">
                  {f.points}/{f.max}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{f.reason}</p>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <Row
            label="Applicable Impact Hydrogen services"
            value={<ListOrNA items={o.suggestedServices} />}
          />
        </div>

        {/* 12–13. Risks & next steps */}
        <SectionTitle>Risks & next steps</SectionTitle>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row
            label="Risks / barriers"
            value={o.risks.length > 0 ? <ListOrNA items={o.risks} /> : 'None detected'}
          />
          <Row label="Recommended next steps" value={<ListOrNA items={o.nextSteps} />} />
        </dl>

        {/* Delivery cost estimate */}
        <SectionTitle>Delivery cost estimate</SectionTitle>
        {!estimateOpen ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEstimateOpen(true)}
            data-testid="open-delivery-estimate"
          >
            <Calculator className="h-3.5 w-3.5" /> Estimate delivery cost
          </Button>
        ) : (
          <div
            className="rounded-lg border border-slate-200 bg-slate-50/50 p-4"
            data-testid="delivery-estimate"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {numField('Experts', 'expertCount')}
              {numField('Total expert days', 'totalExpertDays')}
              {numField('Avg daily rate (EUR)', 'avgDailyRateEur', 25)}
              {numField('Trips', 'trips')}
              {numField('Cost per trip (EUR)', 'costPerTripEur', 100)}
              {numField('Workshops', 'workshops')}
              {numField('Cost per workshop (EUR)', 'costPerWorkshopEur', 250)}
              {numField('Local costs (EUR)', 'localCostsEur', 500)}
              {numField('Subcontracting (EUR)', 'subcontractingEur', 1000)}
              {numField('Contingency %', 'contingencyPercent')}
            </div>
            <div className="mt-3 grid gap-2 rounded-lg bg-white p-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-400">Estimated delivery cost</p>
                <p className="font-semibold text-slate-900" data-testid="delivery-total">
                  {formatEur(estimateResult.totalCostEur)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Opportunity budget</p>
                <p className="font-semibold text-slate-900">
                  {budget != null ? formatEur(budget) : 'Not available'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Estimated margin</p>
                <p
                  className={
                    estimateResult.marginEur != null && estimateResult.marginEur < 0
                      ? 'font-semibold text-rose-600'
                      : 'font-semibold text-emerald-600'
                  }
                  data-testid="delivery-margin"
                >
                  {estimateResult.marginEur != null
                    ? `${formatEur(estimateResult.marginEur)} (${Math.round(estimateResult.marginPercent ?? 0)}%)`
                    : 'Not available'}
                </p>
              </div>
            </div>
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={saveEstimate} data-testid="save-delivery-estimate">
                Save estimate to opportunity
              </Button>
            </div>
          </div>
        )}

        {/* 14. Internal */}
        <SectionTitle>Internal</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <Select
              value={o.status}
              onChange={(e) => {
                changeOpportunityStatus(o.id, e.target.value as Opportunity['status']);
                toast(
                  `Status → ${OPPORTUNITY_STATUS_LABELS[e.target.value as Opportunity['status']]}.`,
                  'success',
                );
              }}
              data-testid="detail-status"
            >
              {OPPORTUNITY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {OPPORTUNITY_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assignee">
            <Input
              value={assigneeDraft}
              onChange={(e) => setAssigneeDraft(e.target.value)}
              onBlur={() => {
                if ((o.assignee ?? '') !== assigneeDraft) {
                  updateOpportunity(
                    o.id,
                    { assignee: assigneeDraft || undefined },
                    `Assignee set to ${assigneeDraft || '—'}.`,
                  );
                }
              }}
              placeholder="Who owns this internally?"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Internal notes">
              <Textarea
                rows={3}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                data-testid="opportunity-notes"
              />
            </Field>
            <div className="mt-1.5 flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                disabled={noteDraft === o.notes}
                onClick={() => {
                  updateOpportunity(o.id, { notes: noteDraft }, 'Internal note updated.');
                  toast('Note saved.', 'success');
                }}
                data-testid="save-opportunity-notes"
              >
                Save note
              </Button>
            </div>
          </div>
        </div>

        {/* 15. History */}
        <SectionTitle>Change history</SectionTitle>
        <ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-slate-500">
          {[...o.history].reverse().map((h, i) => (
            <li key={i}>
              {formatDateTime(h.at)} — {h.event}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
