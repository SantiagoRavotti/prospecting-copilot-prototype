// Create / edit / duplicate-then-edit a campaign. Every field here ends up in
// the research package ChatGPT receives (objective, audience, criteria,
// exclusions, language, style, examples, count).

import { useState } from 'react';
import type { Campaign, Language, Tone } from '../lib/types';
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from './ui';

export interface CampaignDraft {
  name: string;
  objective: string;
  audience: string;
  searchCriteria: string;
  exclusions: string;
  language: Language;
  tone: Tone;
  targetCount: number;
  messageGuidelines: string;
  styleExamples: string;
}

const TONES: { value: Tone; label: string }[] = [
  { value: 'professional', label: 'Profesional' },
  { value: 'warm', label: 'Cercano' },
  { value: 'direct', label: 'Directo' },
  { value: 'curious', label: 'Curioso' },
];

export function draftFromCampaign(c: Campaign | null, defaults: { language: Language; tone: Tone }): CampaignDraft {
  return {
    name: c?.name ?? '',
    objective: c?.objective ?? '',
    audience: c?.audience ?? '',
    searchCriteria: c?.searchCriteria ?? '',
    exclusions: (c?.exclusions ?? []).join('\n'),
    language: c?.language ?? defaults.language,
    tone: c?.tone ?? defaults.tone,
    targetCount: c?.targetCount ?? 3,
    messageGuidelines: c?.messageGuidelines ?? '',
    styleExamples: (c?.styleExamples ?? []).join('\n\n'),
  };
}

/** One entry per line for exclusions; blank-line separated blocks for style examples. */
export function campaignPatchFromDraft(d: CampaignDraft): Partial<Campaign> & { name: string } {
  return {
    name: d.name.trim(),
    objective: d.objective.trim(),
    audience: d.audience.trim(),
    searchCriteria: d.searchCriteria.trim(),
    exclusions: d.exclusions.split('\n').map((x) => x.trim()).filter(Boolean),
    language: d.language,
    tone: d.tone,
    targetCount: Math.max(1, Math.min(50, Math.round(d.targetCount) || 1)),
    messageGuidelines: d.messageGuidelines.trim(),
    styleExamples: d.styleExamples.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean),
  };
}

export default function CampaignForm({
  title,
  subtitle,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  subtitle?: string;
  initial: CampaignDraft;
  submitLabel: string;
  onSubmit: (d: CampaignDraft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<CampaignDraft>(initial);
  const set = <K extends keyof CampaignDraft>(k: K, v: CampaignDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <Card data-testid="campaign-form">
      <CardHeader title={title} subtitle={subtitle} />
      <div className="grid gap-3 px-5 py-4 md:grid-cols-2">
        <Field label="Nombre">
          <Input value={d.name} onChange={(e) => set('name', e.target.value)} data-testid="campaign-name" />
        </Field>
        <Field label="Candidatos solicitados">
          <Input
            type="number"
            min={1}
            max={50}
            value={d.targetCount}
            onChange={(e) => set('targetCount', Number(e.target.value))}
            data-testid="campaign-target"
          />
        </Field>
        <Field label="Objetivo">
          <Textarea rows={2} value={d.objective} onChange={(e) => set('objective', e.target.value)} data-testid="campaign-objective" />
        </Field>
        <Field label="Audiencia">
          <Textarea rows={2} value={d.audience} onChange={(e) => set('audience', e.target.value)} data-testid="campaign-audience" />
        </Field>
        <Field label="Criterios de búsqueda">
          <Textarea rows={2} value={d.searchCriteria} onChange={(e) => set('searchCriteria', e.target.value)} data-testid="campaign-criteria" />
        </Field>
        <Field label="Exclusiones" hint="Una por línea.">
          <Textarea rows={2} value={d.exclusions} onChange={(e) => set('exclusions', e.target.value)} data-testid="campaign-exclusions" />
        </Field>
        <Field label="Idioma">
          <Select value={d.language} onChange={(e) => set('language', e.target.value as Language)}>
            <option value="es">Español</option>
            <option value="en">Inglés</option>
          </Select>
        </Field>
        <Field label="Estilo">
          <Select value={d.tone} onChange={(e) => set('tone', e.target.value as Tone)}>
            {TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Instrucciones de redacción">
          <Textarea rows={3} value={d.messageGuidelines} onChange={(e) => set('messageGuidelines', e.target.value)} data-testid="campaign-guidelines" />
        </Field>
        <Field label="Ejemplos de tu estilo" hint="Separados por una línea en blanco.">
          <Textarea rows={3} value={d.styleExamples} onChange={(e) => set('styleExamples', e.target.value)} data-testid="campaign-examples" />
        </Field>
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={() => onSubmit(d)} disabled={!d.name.trim()} data-testid="campaign-save">
            {submitLabel}
          </Button>
        </div>
      </div>
    </Card>
  );
}
