// Manual opportunity creation ("Analyze this opportunity").
// The prototype cannot fetch the URL — a LOCAL, SIMULATED analysis builds the
// executive record from the fields the user provides, clearly labeled.

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Opportunity, OpportunityType } from '../lib/opportunityTypes';
import { OPPORTUNITY_TYPE_LABELS } from '../lib/opportunityTypes';
import { isDuplicateOpportunity, scoreOpportunity } from '../lib/opportunityScoring';
import { addOpportunity, getState } from '../lib/store';
import { daysFromNow, nowIso, uid } from '../lib/utils';
import { Button, Dialog, Field, Input, Select, Textarea } from './ui';
import { useToast } from './toast';

const schema = z.object({
  title: z.string().min(4, 'Title is required.'),
  url: z
    .string()
    .optional()
    .default('')
    .refine((v) => v === '' || /^https?:\/\/.+\..+/.test(v), {
      message: 'Must be a valid URL (or empty).',
    }),
  organization: z.string().min(2, 'Organization is required.'),
  country: z.string().optional().default(''),
  type: z.string().default('tender'),
  topics: z.string().optional().default(''),
  deadlineDays: z.string().optional().default(''),
  budgetMaxEur: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  assignee: z.string().optional().default(''),
});

type FormValues = z.input<typeof schema>;

export default function AddOpportunityDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const submit = handleSubmit((raw) => {
    const v = schema.parse(raw);
    const state = getState();
    if (
      isDuplicateOpportunity(
        {
          title: v.title,
          organization: v.organization,
          url: v.url || undefined,
          reference: undefined,
        },
        state.opportunities,
      )
    ) {
      toast('This opportunity already exists (same URL or title + organization).', 'error');
      return;
    }

    const topics = v.topics
      .split(/,|\n/)
      .map((t) => t.trim())
      .filter(Boolean);
    const deadlineDays = Number.parseInt(v.deadlineDays, 10);
    const deadline = Number.isFinite(deadlineDays) ? daysFromNow(deadlineDays) : undefined;
    const budgetMaxEur = Number.parseFloat(v.budgetMaxEur) || undefined;
    const eligibility = { consortiumRequired: false, localPartnerRequired: false };
    const summary =
      `${v.organization} — ${v.title}. ` +
      (topics.length > 0 ? `Topics: ${topics.join(', ')}. ` : '') +
      (v.notes ? `${v.notes} ` : '') +
      '(Manually added — details pending verification against the original source.)';

    const { score, level, factors } = scoreOpportunity({
      title: v.title,
      topics,
      services: [],
      organization: v.organization,
      country: v.country || 'Not specified',
      summary,
      budgetMaxEur,
      deadline,
      eligibility,
    });

    const opportunity: Opportunity = {
      id: uid(),
      title: v.title,
      organization: v.organization,
      funder: undefined,
      program: undefined,
      reference: undefined,
      url: v.url || undefined,
      sourceName: 'Manual entry',
      type: (v.type as OpportunityType) ?? 'other',
      contractType: undefined,
      topics,
      services: [],
      country: v.country || 'Not specified',
      region: undefined,
      language: undefined,
      publishedAt: undefined,
      questionsDeadline: undefined,
      deadline,
      startDate: undefined,
      durationMonths: undefined,
      foundAt: nowIso(),
      lastCheckedAt: nowIso(),
      budgetMinEur: undefined,
      budgetMaxEur,
      currency: budgetMaxEur ? 'EUR' : undefined,
      eligibility,
      procedure: undefined,
      evaluationCriteria: undefined,
      expertProfiles: [],
      deliverables: [],
      documents: v.url ? [{ label: 'Original publication', url: v.url }] : [],
      summary,
      scopeOfWork: undefined,
      relevanceRationale:
        factors
          .filter((f) => f.points / f.max >= 0.6)
          .slice(0, 3)
          .map((f) => f.reason)
          .join(' ') || 'Limited data — review the original source to assess relevance.',
      suggestedServices: [],
      risks: ['Manually added — verify details against the original publication.'],
      nextSteps: [
        'Open the original source and verify key data.',
        'Complete missing fields.',
        'Request an internal bid/no-bid decision.',
      ],
      score,
      matchLevel: level,
      matchFactors: factors,
      status: 'new',
      saved: true,
      assignee: v.assignee || undefined,
      notes: v.notes,
      history: [{ at: nowIso(), event: 'Manually added. Simulated prototype analysis generated.' }],
      deliveryEstimate: undefined,
      isDemo: false,
    };

    addOpportunity(opportunity);
    toast('Opportunity created with simulated analysis.', 'success');
    reset();
    onCreated(opportunity.id);
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} title="Analyze this opportunity (manual add)">
      <p className="mb-4 text-xs text-slate-500">
        Paste the URL and whatever you know. The prototype generates a <strong>simulated</strong>{' '}
        executive record locally — it does not fetch the page. Real URL/PDF extraction arrives with
        the MVP.
      </p>
      <form onSubmit={submit} className="space-y-3" data-testid="add-opportunity-form">
        <Field label="Title" error={errors.title?.message}>
          <Input
            {...register('title')}
            placeholder="Development of a National Hydrogen Roadmap"
            data-testid="opp-title"
          />
        </Field>
        <Field label="URL" error={errors.url?.message}>
          <Input {...register('url')} placeholder="https://…" data-testid="opp-url" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Organization" error={errors.organization?.message}>
            <Input
              {...register('organization')}
              placeholder="UNIDO"
              data-testid="opp-organization"
            />
          </Field>
          <Field label="Country">
            <Input {...register('country')} placeholder="Chile" data-testid="opp-country" />
          </Field>
          <Field label="Type">
            <Select {...register('type')}>
              {(Object.keys(OPPORTUNITY_TYPE_LABELS) as OpportunityType[]).map((t) => (
                <option key={t} value={t}>
                  {OPPORTUNITY_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Deadline (days from today)">
            <Input
              type="number"
              {...register('deadlineDays')}
              placeholder="30"
              data-testid="opp-deadline-days"
            />
          </Field>
          <Field label="Max budget (EUR)">
            <Input type="number" {...register('budgetMaxEur')} placeholder="250000" />
          </Field>
          <Field label="Assignee">
            <Input {...register('assignee')} placeholder="Agustín" />
          </Field>
        </div>
        <Field label="Topics (comma separated)">
          <Input
            {...register('topics')}
            placeholder="green hydrogen, roadmap, energy transition"
            data-testid="opp-topics"
          />
        </Field>
        <Field label="Notes">
          <Textarea rows={2} {...register('notes')} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="opp-submit">
            Create & analyze (simulated)
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
