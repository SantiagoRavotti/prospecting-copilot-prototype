// Browser-side exports: CSV, XLSX (SheetJS), JSON backup. Nothing leaves the
// browser — files are generated locally and downloaded.

import * as XLSX from 'xlsx';
import type { AppState, Prospect } from './types';
import type { Opportunity } from './opportunityTypes';
import { toCsv } from './csv';
import { downloadBlob } from './utils';
import { companyById, personById } from './store';

export const EXPORT_HEADER = [
  'Person',
  'Title',
  'Company',
  'Country',
  'LinkedIn URL',
  'Company website',
  'Score',
  'Priority',
  'Status',
  'Fit reason',
  'Commercial trigger',
  'Original draft',
  'Edited message',
  'Final message',
  'Sent date',
  'Response status',
  'Meeting status',
  'Notes',
];

const RESPONDED_STATUSES = ['replied', 'meeting_proposed', 'meeting_booked', 'opportunity'];
const MEETING_STATUSES = ['meeting_proposed', 'meeting_booked', 'opportunity'];

export function exportRows(state: AppState, prospects: Prospect[]): (string | number)[][] {
  return prospects.map((p) => {
    const person = personById(state, p.personId);
    const company = companyById(state, p.companyId);
    return [
      person?.fullName ?? '',
      person?.title ?? '',
      company?.name ?? '',
      person?.country ?? '',
      person?.linkedinUrl ?? '',
      company?.website ?? '',
      p.score,
      p.priority,
      p.status,
      p.fitReason,
      company?.commercialTrigger ?? '',
      p.originalDraft,
      p.editedMessage ?? '',
      p.finalMessage ?? '',
      p.sentAt ?? '',
      RESPONDED_STATUSES.includes(p.status) ? 'responded' : p.sentAt ? 'no response yet' : '',
      MEETING_STATUSES.includes(p.status) ? p.status : '',
      p.notes,
    ];
  });
}

export function exportCsv(
  state: AppState,
  prospects: Prospect[],
  filename = 'prospects.csv',
): void {
  const csv = toCsv(EXPORT_HEADER, exportRows(state, prospects));
  // Prepend a BOM so Excel opens the UTF-8 CSV correctly.
  downloadBlob('\uFEFF' + csv, filename, 'text/csv;charset=utf-8');
}

export function exportXlsx(
  state: AppState,
  prospects: Prospect[],
  filename = 'prospects.xlsx',
): void {
  const rows = [EXPORT_HEADER, ...exportRows(state, prospects)];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = EXPORT_HEADER.map((h) => ({ wch: Math.max(12, Math.min(40, h.length + 8)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Prospects');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}

export function exportBackup(state: AppState, filename = 'prospecting-copilot-backup.json'): void {
  downloadBlob(JSON.stringify(state, null, 2), filename, 'application/json');
}

// ---------------------------------------------------------------------------
// Opportunities exports
// ---------------------------------------------------------------------------

export const OPPORTUNITY_EXPORT_HEADER = [
  'Title',
  'Organization',
  'Funder',
  'Reference',
  'Type',
  'Topics',
  'Country',
  'Region',
  'Budget max (EUR)',
  'Deadline',
  'Days remaining',
  'Match score',
  'Match level',
  'Status',
  'Saved',
  'Assignee',
  'Source',
  'URL',
  'Estimated delivery cost (EUR)',
  'Estimated margin (EUR)',
  'Notes',
];

export function opportunityExportRows(opportunities: Opportunity[]): (string | number)[][] {
  return opportunities.map((o) => {
    const days = o.deadline
      ? Math.floor((new Date(o.deadline).getTime() - Date.now()) / 86_400_000)
      : '';
    return [
      o.title,
      o.organization,
      o.funder ?? '',
      o.reference ?? '',
      o.type,
      o.topics.join('; '),
      o.country,
      o.region ?? '',
      o.budgetMaxEur ?? '',
      o.deadline ? o.deadline.slice(0, 10) : '',
      days,
      o.score,
      o.matchLevel,
      o.status,
      o.saved ? 'yes' : 'no',
      o.assignee ?? '',
      o.sourceName,
      o.url ?? '',
      o.deliveryEstimate?.result.totalCostEur ?? '',
      o.deliveryEstimate?.result.marginEur ?? '',
      o.notes,
    ];
  });
}

export function exportOpportunitiesCsv(
  opportunities: Opportunity[],
  filename = 'opportunities.csv',
): void {
  const csv = toCsv(OPPORTUNITY_EXPORT_HEADER, opportunityExportRows(opportunities));
  downloadBlob('\uFEFF' + csv, filename, 'text/csv;charset=utf-8');
}

export function exportOpportunitiesXlsx(
  opportunities: Opportunity[],
  filename = 'opportunities.xlsx',
): void {
  const rows = [OPPORTUNITY_EXPORT_HEADER, ...opportunityExportRows(opportunities)];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = OPPORTUNITY_EXPORT_HEADER.map((h) => ({
    wch: Math.max(12, Math.min(45, h.length + 10)),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Opportunities');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}
