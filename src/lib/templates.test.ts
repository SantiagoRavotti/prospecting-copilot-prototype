import { describe, expect, it } from 'vitest';
import {
  buildTemplateVars,
  generateDraft,
  MESSAGE_PATTERNS,
  patternsForLanguage,
  pickPattern,
  renderTemplate,
} from './templates';
import { buildDemoState } from '../data/demoData';

describe('renderTemplate', () => {
  it('substitutes variables', () => {
    const out = renderTemplate('Hi {{firstName}}, I saw {{company}}.', {
      firstName: 'Ana',
      company: 'Acme',
    });
    expect(out).toBe('Hi Ana, I saw Acme.');
  });

  it('collapses missing variables without leaving braces or double spaces', () => {
    const out = renderTemplate('Hi {{firstName}}, about {{relevantTopic}} , ok?', {
      firstName: 'Ana',
    });
    expect(out).not.toContain('{{');
    expect(out).not.toContain('  ');
    expect(out).not.toContain(' ,');
  });

  it('trims whitespace artifacts from empty parenthesized vars', () => {
    const out = renderTemplate('I am {{senderName}} ({{senderCompany}}).', {
      senderName: 'Santi',
    });
    expect(out).toBe('I am Santi.');
  });
});

describe('pickPattern', () => {
  it('is deterministic for the same seed', () => {
    const a = pickPattern('seed-1', 'en');
    const b = pickPattern('seed-1', 'en');
    expect(a.id).toBe(b.id);
  });

  it('returns a pattern of the requested language', () => {
    expect(pickPattern('x', 'es').language).toBe('es');
    expect(pickPattern('x', 'en').language).toBe('en');
  });

  it('produces variety across seeds', () => {
    const ids = new Set(Array.from({ length: 40 }, (_, i) => pickPattern(`seed-${i}`, 'en').id));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe('patternsForLanguage', () => {
  it('has multiple patterns per supported language', () => {
    expect(patternsForLanguage('en').length).toBeGreaterThanOrEqual(3);
    expect(patternsForLanguage('es').length).toBeGreaterThanOrEqual(2);
  });
});

describe('generateDraft', () => {
  it('produces a personalized draft from prospect fields', () => {
    const state = buildDemoState();
    const workspace = state.workspaces[0]!;
    const person = state.people[0]!;
    const company = state.companies.find((c) => c.id === person.companyId)!;
    const draft = generateDraft(person, company, workspace);
    expect(draft.message.length).toBeGreaterThan(30);
    expect(draft.message).toContain(person.firstName);
    expect(MESSAGE_PATTERNS.some((p) => p.id === draft.patternId)).toBe(true);
  });

  it('buildTemplateVars falls back to trigger when no initiative exists', () => {
    const vars = buildTemplateVars(
      { fullName: 'Jo Doe', firstName: 'Jo', title: 'CEO', country: 'Spain' },
      { name: 'Acme', commercialTrigger: 'a new plant', relevantInitiatives: [] },
      { senderName: 'S', senderCompany: 'C', valueProposition: 'v' },
    );
    expect(vars.relevantTopic).toBe('a new plant');
  });
});
