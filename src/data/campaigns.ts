// Desktop first-run state: Santiago's two REAL campaigns over the same
// LinkedIn account. No demo data — this is the working tool.

import type { AppState, Workspace } from '../lib/types';
import { emptyCloudState } from '../lib/sync/mappers';

const SENDER = {
  senderName: 'Santiago Ravotti',
  senderTitle: 'Data & AI Consultant',
  senderBio:
    'Data and AI professional: analytics platforms, applied AI products and commercial intelligence tools.',
};

export const CAMPAIGN_BL_ID = 'camp-business-league-es';
export const CAMPAIGN_DATA_AI_ID = 'camp-consultoria-datos-ia';

export const DESKTOP_CAMPAIGNS: Workspace[] = [
  {
    id: CAMPAIGN_BL_ID,
    name: 'Business League España',
    ...SENDER,
    senderCompany: 'Business League',
    services: [
      'Networking empresarial de alto nivel',
      'Eventos y comunidad para directivos',
      'Partnerships y patrocinios',
    ],
    valueProposition:
      'una comunidad de networking para directivos y empresas líderes, ahora llegando a España',
    defaultLanguage: 'es',
    defaultTone: 'warm',
    preferredMessageLength: 'short',
    dailyTarget: 10,
    targetingRules: {
      targetCountries: ['Spain'],
      targetIndustries: ['Technology', 'Finance', 'Energy', 'Retail', 'Pharma', 'Industry'],
      targetRoles: [
        'CEO',
        'Founder',
        'Managing Director',
        'Country Manager',
        'Director General',
        'VP',
      ],
      targetCompanyTypes: ['Enterprise', 'Scale-up', 'Family office', 'Association'],
      keywords: ['networking', 'comunidad', 'liderazgo', 'expansión', 'España'],
      negativeKeywords: [],
      excludedCompanies: [],
    },
  },
  {
    id: CAMPAIGN_DATA_AI_ID,
    name: 'Consultoría Datos & IA',
    ...SENDER,
    senderCompany: 'Independiente',
    services: [
      'Consultoría de datos y analítica',
      'Productos aplicados de IA',
      'Data engineering y plataformas',
      'Formación y advisory',
    ],
    valueProposition:
      'consultoría de datos e IA aplicada: de la analítica a productos de IA en producción',
    defaultLanguage: 'es',
    defaultTone: 'professional',
    preferredMessageLength: 'short',
    dailyTarget: 10,
    targetingRules: {
      targetCountries: ['Spain', 'Argentina', 'Romania', 'United Kingdom', 'Mexico'],
      targetIndustries: ['Technology', 'Retail', 'Finance', 'Health', 'Media', 'Energy'],
      targetRoles: [
        'CTO',
        'CDO',
        'Head of Data',
        'Head of Analytics',
        'VP Engineering',
        'Innovation Director',
        'CEO',
      ],
      targetCompanyTypes: ['Startup', 'Scale-up', 'Enterprise', 'Consultancy'],
      keywords: ['data', 'AI', 'IA', 'analytics', 'machine learning', 'LLM', 'plataforma'],
      negativeKeywords: [],
      excludedCompanies: [],
    },
  },
];

export function buildDesktopInitialState(): AppState {
  const state = emptyCloudState();
  state.workspaces = structuredClone(DESKTOP_CAMPAIGNS);
  state.activeWorkspaceId = CAMPAIGN_BL_ID;
  return state;
}
