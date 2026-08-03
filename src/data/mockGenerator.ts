// Procedural mock-prospect generator for "Generate today's mock prospects".
// Everything produced here is fictional and labeled as demo data. The staged
// progress shown in the UI is a SIMULATION — no web research occurs.

import type { AppState, Company, Person, Prospect, Workspace } from '../lib/types';
import { computeScore, normalizeSeniority, priorityForScore } from '../lib/scoring';
import { generateDraft } from '../lib/templates';
import { firstNameOf, lastNameOf, mulberry32, nowIso, uid } from '../lib/utils';
import { removeDuplicates, type DedupeCandidate } from '../lib/dedupe';
import { WS_IMPACT_HYDROGEN_ID } from './demoData';

const FIRST_NAMES = [
  'Elena',
  'Marco',
  'Sofia',
  'Lukas',
  'Amaia',
  'Pieter',
  'Camille',
  'Jonas',
  'Isabel',
  'Mateusz',
  'Freja',
  'Diego',
  'Hanna',
  'Tomás',
  'Linnea',
  'Rafael',
  'Greta',
  'Andrés',
  'Maren',
  'Paulo',
  'Vera',
  'Niklas',
  'Lucía',
  'Sander',
  'Chiara',
  'Björn',
  'Alba',
  'Emil',
  'Teresa',
  'Ruben',
  'Silvia',
  'Oskar',
  'Julia',
  'Anders',
  'Carla',
  'Milan',
  'Nora',
  'Xavier',
  'Ines',
  'Viktor',
];

const LAST_NAMES = [
  'Weissenberg',
  'Castellanos',
  'Lindgren',
  'Moreau',
  'van der Beek',
  'Kovács',
  'Ferrante',
  'Aguirre',
  'Sørensen',
  'Nowak',
  'Björklund',
  'Delgado',
  'Hoffmann',
  'Riera',
  'Jansen',
  'Marchetti',
  'Urrutia',
  'Lehmann',
  'Costa e Silva',
  'Ekström',
  'Dubois',
  'Marinov',
  'Zubizarreta',
  'Petersen',
  'Grigoletti',
  'Haugland',
  'Miralles',
  'Brandt',
  'Okonkwo',
  'Valente',
];

interface RoleDef {
  title: string;
  area: string;
}

const IH_ROLES: RoleDef[] = [
  { title: 'Head of Hydrogen', area: 'Strategy' },
  { title: 'Hydrogen Project Manager', area: 'Projects' },
  { title: 'Business Development Director', area: 'Business development' },
  { title: 'Energy Transition Director', area: 'Strategy' },
  { title: 'Head of Sustainability', area: 'Sustainability' },
  { title: 'Managing Director', area: 'General management' },
  { title: 'Innovation Director', area: 'Innovation' },
  { title: 'Project Director', area: 'Projects' },
  { title: 'Cluster Manager', area: 'Ecosystem coordination' },
  { title: 'Strategy Director', area: 'Strategy' },
];

const SP_ROLES: RoleDef[] = [
  { title: 'Head of Data', area: 'Data' },
  { title: 'CTO', area: 'Engineering' },
  { title: 'Head of Analytics', area: 'Data' },
  { title: 'Founder', area: 'General management' },
  { title: 'VP Engineering', area: 'Engineering' },
  { title: 'Innovation Director', area: 'Innovation' },
  { title: 'Data Director', area: 'Data' },
];

interface CompanyTemplate {
  name: string;
  industry: string;
  type: string;
  city: string;
  country: string;
  initiative: string;
  trigger: string;
}

const IH_COMPANY_TEMPLATES: CompanyTemplate[] = [
  {
    name: 'Meseta Solar H2',
    industry: 'Hydrogen',
    type: 'Project developer',
    city: 'Ciudad Real',
    country: 'Spain',
    initiative: 'Solar-to-hydrogen plant permitting',
    trigger: 'entered permitting for a solar-to-hydrogen plant',
  },
  {
    name: 'Port de Roussanne',
    industry: 'Ports',
    type: 'Port',
    city: 'Marseille',
    country: 'France',
    initiative: 'H2 bunkering pilot berth',
    trigger: 'allocated a pilot berth for hydrogen bunkering',
  },
  {
    name: 'Weser Stahlwerke',
    industry: 'Steel',
    type: 'Industrial',
    city: 'Bremen',
    country: 'Germany',
    initiative: 'DRI feasibility with green hydrogen',
    trigger: 'started a DRI feasibility study',
  },
  {
    name: 'Costa Verde Energía',
    industry: 'Utilities',
    type: 'Utility',
    city: 'Gijón',
    country: 'Spain',
    initiative: 'Electrolyzer siting study',
    trigger: 'tendered an electrolyzer siting study',
  },
  {
    name: 'Jutland Green Fuels',
    industry: 'Energy',
    type: 'Project developer',
    city: 'Esbjerg',
    country: 'Denmark',
    initiative: 'E-methanol plant FID preparation',
    trigger: 'is preparing FID on an e-methanol plant',
  },
  {
    name: 'Alpenwasserstoff Verbund',
    industry: 'Hydrogen',
    type: 'Hydrogen Valley',
    city: 'Innsbruck',
    country: 'Austria',
    initiative: 'Alpine hydrogen valley application',
    trigger: 'submitted an alpine hydrogen valley application',
  },
  {
    name: 'Tagus Clean Mobility',
    industry: 'Logistics',
    type: 'Logistics',
    city: 'Lisbon',
    country: 'Portugal',
    initiative: 'H2 bus fleet procurement',
    trigger: 'opened procurement for a hydrogen bus fleet',
  },
  {
    name: 'Brabant Waterstof Cluster',
    industry: 'Hydrogen',
    type: 'Cluster',
    city: 'Eindhoven',
    country: 'Netherlands',
    initiative: 'SME hydrogen adoption program',
    trigger: 'launched an SME hydrogen adoption program',
  },
  {
    name: 'Aegean Hydrogen Hub',
    industry: 'Hydrogen',
    type: 'Hydrogen hub',
    city: 'Athens',
    country: 'Greece',
    initiative: 'Island microgrid H2 storage',
    trigger: 'piloting hydrogen storage for island microgrids',
  },
  {
    name: 'Silesia H2 Works',
    industry: 'Industrial',
    type: 'Industrial',
    city: 'Katowice',
    country: 'Poland',
    initiative: 'Coke-oven gas hydrogen recovery',
    trigger: 'evaluating hydrogen recovery from coke-oven gas',
  },
];

const SP_COMPANY_TEMPLATES: CompanyTemplate[] = [
  {
    name: 'Delta Insights Co',
    industry: 'Data',
    type: 'Consultancy',
    city: 'Valencia',
    country: 'Spain',
    initiative: 'GenAI service line launch',
    trigger: 'launched a GenAI service line',
  },
  {
    name: 'Pampa Software Labs',
    industry: 'Technology',
    type: 'Startup',
    city: 'Córdoba',
    country: 'Argentina',
    initiative: 'LLM tooling for agtech',
    trigger: 'building LLM tooling for agtech',
  },
  {
    name: 'Thames Analytics Partners',
    industry: 'Analytics',
    type: 'Consultancy',
    city: 'London',
    country: 'United Kingdom',
    initiative: 'Marketing mix modeling practice',
    trigger: 'expanding its marketing analytics practice',
  },
  {
    name: 'Baltic Commerce Cloud',
    industry: 'Retail',
    type: 'Scale-up',
    city: 'Riga',
    country: 'Latvia',
    initiative: 'Personalization engine rebuild',
    trigger: 'rebuilding its personalization engine',
  },
  {
    name: 'Meseta Fintech',
    industry: 'Fintech',
    type: 'Scale-up',
    city: 'Madrid',
    country: 'Spain',
    initiative: 'Fraud ML platform',
    trigger: 'hiring for a fraud ML platform team',
  },
];

export interface GeneratedBatch {
  companies: Company[];
  people: Person[];
  prospects: Prospect[];
  requested: number;
  duplicatesRemoved: number;
}

/**
 * Generate a batch of fictional prospects for a workspace. Deliberately
 * produces a few duplicate candidates so the "duplicate removal" stage in the
 * simulated pipeline reflects real behavior.
 */
export function generateMockBatch(
  state: AppState,
  workspace: Workspace,
  count: number,
  seed = Date.now(),
): GeneratedBatch {
  const rand = mulberry32(seed >>> 0);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;

  const isIH = workspace.id === WS_IMPACT_HYDROGEN_ID;
  const roles = isIH ? IH_ROLES : SP_ROLES;
  const templates = isIH ? IH_COMPANY_TEMPLATES : SP_COMPANY_TEMPLATES;
  const reusableCompanies = state.companies.filter((c) =>
    isIH
      ? !['Data', 'AI', 'Analytics', 'Fintech', 'Retail', 'Health', 'Media', 'Technology'].includes(
          c.industry,
        )
      : ['Data', 'AI', 'Analytics', 'Fintech', 'Retail', 'Health', 'Media', 'Technology'].includes(
          c.industry,
        ),
  );

  const existing: DedupeCandidate[] = state.people.map((p) => ({
    fullName: p.fullName,
    companyName: state.companies.find((c) => c.id === p.companyId)?.name ?? '',
    linkedinUrl: p.linkedinUrl,
  }));

  const newCompanies = new Map<string, Company>();
  const candidates: {
    fullName: string;
    companyName: string;
    linkedinUrl: string;
    role: RoleDef;
    company: Company;
  }[] = [];

  // Over-generate ~10% so duplicate removal has something to remove.
  const target = Math.ceil(count * 1.12) + 2;
  let guard = 0;
  while (candidates.length < target && guard < target * 30) {
    guard++;
    const fullName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const role = pick(roles);

    let company: Company;
    if (reusableCompanies.length > 0 && rand() < 0.45) {
      company = pick(reusableCompanies);
    } else {
      const t = pick(templates);
      const known = newCompanies.get(t.name) ?? state.companies.find((c) => c.name === t.name);
      if (known) {
        company = known;
      } else {
        company = {
          id: uid(),
          name: t.name,
          website: `https://example.com/${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          industry: t.industry,
          city: t.city,
          country: t.country,
          size: pick(['11-50', '51-200', '201-500', '501-1000', '1000+']),
          type: t.type,
          description: `${t.name} — fictional demo organization in ${t.industry.toLowerCase()} (${t.city}, ${t.country}). ${t.initiative}.`,
          relevantInitiatives: [t.initiative],
          commercialTrigger: t.trigger,
          score: 0,
          notes: '',
          isDemo: true,
        };
        newCompanies.set(t.name, company);
      }
    }

    const slug = `${fullName} ${company.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    candidates.push({
      fullName,
      companyName: company.name,
      linkedinUrl: `https://www.linkedin.com/in/demo-${slug}`,
      role,
      company,
    });
  }

  const { unique, duplicates } = removeDuplicates(candidates, existing);
  const selected = unique.slice(0, count);

  const people: Person[] = [];
  const prospects: Prospect[] = [];
  const usedCompanies = new Set<string>();

  for (const c of selected) {
    const confidence = rand() < 0.55 ? 'high' : rand() < 0.75 ? 'medium' : 'low';
    const person: Person = {
      id: uid(),
      fullName: c.fullName,
      firstName: firstNameOf(c.fullName),
      lastName: lastNameOf(c.fullName),
      title: c.role.title,
      companyId: c.company.id,
      city: c.company.city,
      country: c.company.country,
      linkedinUrl: c.linkedinUrl,
      seniority: normalizeSeniority(c.role.title),
      functionalArea: c.role.area,
      professionalSummary: `${c.role.title} at ${c.company.name} in ${c.company.city}, ${c.company.country}. Involved in ${c.company.relevantInitiatives[0] ?? 'sector initiatives'}. (Simulated research — demo data.)`,
      careerSummary: `Experience in ${c.role.area.toLowerCase()} roles in the ${c.company.industry.toLowerCase()} sector. (Demo career summary — fictional data.)`,
      researchConfidence: confidence,
      sourceReferences: ['Demo source — mock discovery', 'Demo source — simulated research'],
      isDemo: true,
    };
    people.push(person);
    usedCompanies.add(c.company.id);

    const { score, breakdown } = computeScore(person, c.company, workspace);
    const priority = priorityForScore(score, confidence);
    const angle = `Reference ${c.company.commercialTrigger} and offer a relevant perspective.`;
    const draft = generateDraft(person, c.company, workspace, angle);
    const created = nowIso();
    prospects.push({
      id: uid(),
      workspaceId: workspace.id,
      personId: person.id,
      companyId: c.company.id,
      status: 'ready_for_review',
      priority,
      score,
      scoreBreakdown: breakdown,
      fitReason: `${c.role.title} at an organization matching the workspace targeting (${c.company.type.toLowerCase()}, ${c.company.industry.toLowerCase()}).`,
      timingReason: `${c.company.name} ${c.company.commercialTrigger}.`,
      outreachAngle: angle,
      recommendedService: workspace.services[Math.floor(rand() * workspace.services.length)] ?? '',
      patternId: draft.patternId,
      originalDraft: draft.message,
      editedMessage: null,
      finalMessage: null,
      notes: '',
      createdAt: created,
      reviewedAt: null,
      editedAt: null,
      sentAt: null,
      lastActivityAt: created,
      outcome: null,
      isDemo: true,
    });
    c.company.score = Math.max(c.company.score, score);
  }

  return {
    companies: [...newCompanies.values()].filter((c) => usedCompanies.has(c.id)),
    people,
    prospects,
    requested: count,
    duplicatesRemoved: duplicates,
  };
}
