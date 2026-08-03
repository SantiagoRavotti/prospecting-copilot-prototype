// Browser-side exports: CSV, XLSX (SheetJS), JSON backup. Nothing leaves the
// browser — files are generated locally and downloaded.

import * as XLSX from 'xlsx';
import type { AppState, Prospect } from './types';
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
