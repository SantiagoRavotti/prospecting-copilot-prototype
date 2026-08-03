// Local message-template engine.
// This is NOT an AI model. It produces "Prototype-generated message" drafts by
// substituting prospect/workspace fields into a set of local patterns.

import type { Company, Language, Person, Prospect, Workspace } from './types';
import { firstNameOf, hashString } from './utils';

export interface TemplateVars {
  firstName: string;
  company: string;
  role: string;
  relevantTopic: string;
  commercialTrigger: string;
  senderName: string;
  senderCompany: string;
  shortValueProposition: string;
  outreachAngle: string;
  country: string;
}

export interface MessagePattern {
  id: string;
  name: string;
  language: Language;
  template: string;
}

export const MESSAGE_PATTERNS: MessagePattern[] = [
  {
    id: 'en-work-reference',
    name: 'Work reference',
    language: 'en',
    template:
      'Hi {{firstName}}, I saw your work around {{relevantTopic}} at {{company}}. ' +
      "I'm {{senderName}} from {{senderCompany}}. We work with {{shortValueProposition}}. " +
      "I'd be glad to connect and follow your work.",
  },
  {
    id: 'en-trigger-question',
    name: 'Trigger question',
    language: 'en',
    template:
      'Hi {{firstName}}, {{commercialTrigger}} caught my attention — congratulations. ' +
      'At {{senderCompany}} we support {{shortValueProposition}}, and {{outreachAngle}}. ' +
      'Would be great to connect.',
  },
  {
    id: 'en-peer-intro',
    name: 'Peer introduction',
    language: 'en',
    template:
      "Hello {{firstName}}, as {{role}} at {{company}} I imagine {{relevantTopic}} is high on your agenda. I'm {{senderName}} ({{senderCompany}}) — we work on {{shortValueProposition}}. Happy to connect.",
  },
  {
    id: 'en-ecosystem',
    name: 'Ecosystem angle',
    language: 'en',
    template:
      'Hi {{firstName}}, I follow developments in {{relevantTopic}} across {{country}} and {{company}} keeps coming up. ' +
      "I'm {{senderName}} from {{senderCompany}} — {{shortValueProposition}}. I'd value being connected.",
  },
  {
    id: 'en-short-direct',
    name: 'Short and direct',
    language: 'en',
    template:
      'Hi {{firstName}} — {{senderName}} from {{senderCompany}} here. Given {{commercialTrigger}}, I think a conversation could be useful for both sides. Glad to connect.',
  },
  {
    id: 'es-referencia',
    name: 'Referencia al trabajo',
    language: 'es',
    template:
      'Hola {{firstName}}, vi tu trabajo en {{relevantTopic}} en {{company}}. ' +
      'Soy {{senderName}} y trabajo en {{shortValueProposition}}. ' +
      'Me encantaría conectar y seguir tu trabajo.',
  },
  {
    id: 'es-interes-comun',
    name: 'Interés común',
    language: 'es',
    template:
      'Hola {{firstName}}, como {{role}} en {{company}} imagino que {{relevantTopic}} es parte central de tu agenda. Soy {{senderName}} — {{shortValueProposition}}. Un gusto conectar.',
  },
  {
    id: 'es-oportunidad',
    name: 'Oportunidad',
    language: 'es',
    template:
      'Hola {{firstName}}, {{commercialTrigger}} me pareció muy interesante. Soy {{senderName}} y {{outreachAngle}}. Encantado de conectar.',
  },
];

/**
 * Replace {{variables}} in a template. Unknown or empty variables collapse to a
 * sensible fallback so the message never shows raw braces.
 */
export function renderTemplate(template: string, vars: Partial<TemplateVars>): string {
  const rendered = template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key as keyof TemplateVars];
    return value && value.trim().length > 0 ? value.trim() : '';
  });
  // Clean up artifacts from empty variables: double spaces, space before punctuation.
  return rendered
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
}

export function patternsForLanguage(language: Language): MessagePattern[] {
  const matches = MESSAGE_PATTERNS.filter((p) => p.language === language);
  return matches.length > 0 ? matches : MESSAGE_PATTERNS.filter((p) => p.language === 'en');
}

/** Deterministically pick a pattern so the same prospect always gets the same draft. */
export function pickPattern(seedKey: string, language: Language): MessagePattern {
  const pool = patternsForLanguage(language);
  const index = hashString(seedKey) % pool.length;
  const pattern = pool[index];
  if (!pattern) throw new Error('No message patterns available');
  return pattern;
}

export function buildTemplateVars(
  person: Pick<Person, 'fullName' | 'firstName' | 'title' | 'country'>,
  company: Pick<Company, 'name' | 'commercialTrigger' | 'relevantInitiatives'>,
  workspace: Pick<Workspace, 'senderName' | 'senderCompany' | 'valueProposition'>,
  prospect?: Pick<Prospect, 'outreachAngle'>,
): TemplateVars {
  const relevantTopic =
    company.relevantInitiatives[0] ?? company.commercialTrigger ?? 'your sector';
  return {
    firstName: person.firstName || firstNameOf(person.fullName),
    company: company.name,
    role: person.title,
    relevantTopic,
    commercialTrigger: company.commercialTrigger || relevantTopic,
    senderName: workspace.senderName,
    senderCompany: workspace.senderCompany,
    shortValueProposition: workspace.valueProposition,
    outreachAngle: prospect?.outreachAngle ?? '',
    country: person.country,
  };
}

export interface DraftResult {
  patternId: string;
  message: string;
}

export function generateDraft(
  person: Person,
  company: Company,
  workspace: Workspace,
  outreachAngle?: string,
): DraftResult {
  const pattern = pickPattern(person.id + workspace.id, workspace.defaultLanguage);
  const vars = buildTemplateVars(
    person,
    company,
    workspace,
    outreachAngle ? { outreachAngle } : undefined,
  );
  return { patternId: pattern.id, message: renderTemplate(pattern.template, vars) };
}
