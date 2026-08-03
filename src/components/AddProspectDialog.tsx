// "Add prospect manually" — lets the user test the workflow with real
// LinkedIn profiles they enter themselves. The app never scrapes LinkedIn.

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Company, Person, Prospect, Workspace } from '../lib/types';
import { addEntities, getState, logActivity } from '../lib/store';
import { computeScore, normalizeSeniority, priorityForScore } from '../lib/scoring';
import { generateDraft } from '../lib/templates';
import { firstNameOf, lastNameOf, nowIso, uid } from '../lib/utils';
import { isDuplicate } from '../lib/dedupe';
import { Button, Dialog, Field, Input, Textarea } from './ui';
import { useToast } from './toast';

const schema = z.object({
  fullName: z.string().min(2, 'Name is required.'),
  title: z.string().min(2, 'Title is required.'),
  company: z.string().min(1, 'Company is required.'),
  country: z.string().optional().default(''),
  linkedinUrl: z
    .string()
    .optional()
    .default('')
    .refine((v) => v === '' || /^https?:\/\/([\w-]+\.)*linkedin\.com\/.+/i.test(v), {
      message: 'Must be a linkedin.com URL (or empty).',
    }),
  trigger: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

type FormValues = z.input<typeof schema>;

export default function AddProspectDialog({
  open,
  onClose,
  workspace,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  workspace: Workspace;
  onCreated: (prospectId: string) => void;
}) {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const submit = handleSubmit((raw) => {
    const values = schema.parse(raw);
    const state = getState();

    const existing = state.people.map((p) => ({
      fullName: p.fullName,
      companyName: state.companies.find((c) => c.id === p.companyId)?.name ?? '',
      linkedinUrl: p.linkedinUrl,
    }));
    if (
      isDuplicate(
        { fullName: values.fullName, companyName: values.company, linkedinUrl: values.linkedinUrl },
        existing,
      )
    ) {
      toast('This person already exists (same LinkedIn URL or name + company).', 'error');
      return;
    }

    let company: Company | undefined = state.companies.find(
      (c) => c.name.toLowerCase() === values.company.toLowerCase(),
    );
    const newCompanies: Company[] = [];
    if (!company) {
      company = {
        id: uid(),
        name: values.company,
        website: '',
        industry: '',
        city: '',
        country: values.country,
        size: '',
        type: '',
        description: '',
        relevantInitiatives: values.trigger ? [values.trigger] : [],
        commercialTrigger: values.trigger,
        score: 0,
        notes: '',
        isDemo: false,
      };
      newCompanies.push(company);
    }

    const person: Person = {
      id: uid(),
      fullName: values.fullName,
      firstName: firstNameOf(values.fullName),
      lastName: lastNameOf(values.fullName),
      title: values.title,
      companyId: company.id,
      city: '',
      country: values.country,
      linkedinUrl: values.linkedinUrl,
      seniority: normalizeSeniority(values.title),
      functionalArea: '',
      professionalSummary: values.notes || `${values.title} at ${values.company}.`,
      careerSummary: '',
      researchConfidence: 'medium',
      sourceReferences: ['Manually added by the user'],
      isDemo: false,
    };

    const { score, breakdown } = computeScore(person, company, workspace);
    const priority = priorityForScore(score);
    const angle = values.trigger
      ? `Reference ${values.trigger} and offer a relevant perspective.`
      : 'General introduction based on shared professional interests.';
    const draft = generateDraft(person, company, workspace, angle);
    const now = nowIso();
    const prospect: Prospect = {
      id: uid(),
      workspaceId: workspace.id,
      personId: person.id,
      companyId: company.id,
      status: 'ready_for_review',
      priority,
      score,
      scoreBreakdown: breakdown,
      fitReason: values.notes || `Manually added prospect at ${values.company}.`,
      timingReason: values.trigger || 'Manually added — timing set by the user.',
      outreachAngle: angle,
      recommendedService: workspace.services[0] ?? '',
      patternId: draft.patternId,
      originalDraft: draft.message,
      editedMessage: null,
      finalMessage: null,
      notes: values.notes,
      createdAt: now,
      reviewedAt: null,
      editedAt: null,
      sentAt: null,
      lastActivityAt: now,
      outcome: null,
      isDemo: false,
    };

    addEntities({
      companies: newCompanies,
      people: [person],
      prospects: [prospect],
      activities: [
        logActivity(prospect.id, 'created', 'Manually added prospect.', null, 'ready_for_review'),
      ],
    });
    toast(`${values.fullName} added to the review queue.`, 'success');
    reset();
    onCreated(prospect.id);
    onClose();
  });

  return (
    <Dialog open={open} onClose={onClose} title="Add prospect manually">
      <p className="mb-4 text-xs text-slate-500">
        Enter a real or fictional prospect yourself. The draft message is produced by the local
        template engine — nothing is fetched from LinkedIn or the web.
      </p>
      <form onSubmit={submit} className="space-y-3" data-testid="add-prospect-form">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" error={errors.fullName?.message}>
            <Input {...register('fullName')} placeholder="Jane Smith" data-testid="add-name" />
          </Field>
          <Field label="Title" error={errors.title?.message}>
            <Input {...register('title')} placeholder="Head of Hydrogen" data-testid="add-title" />
          </Field>
          <Field label="Company" error={errors.company?.message}>
            <Input {...register('company')} placeholder="Acme Energy" data-testid="add-company" />
          </Field>
          <Field label="Country">
            <Input {...register('country')} placeholder="Spain" />
          </Field>
        </div>
        <Field label="LinkedIn profile URL" error={errors.linkedinUrl?.message}>
          <Input
            {...register('linkedinUrl')}
            placeholder="https://www.linkedin.com/in/…"
            data-testid="add-linkedin"
          />
        </Field>
        <Field label="Relevant project or trigger">
          <Input
            {...register('trigger')}
            placeholder="announced a 100 MW electrolyzer project"
            data-testid="add-trigger"
          />
        </Field>
        <Field label="Notes">
          <Textarea {...register('notes')} rows={2} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="add-submit">
            Create prospect
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
