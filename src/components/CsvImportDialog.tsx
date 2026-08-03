// CSV import — processed entirely in the browser; the file is never uploaded.

import { useRef, useState } from 'react';
import { FileUp, Upload } from 'lucide-react';
import type { Company, Person, Prospect, Workspace } from '../lib/types';
import { addEntities, getState, logActivity } from '../lib/store';
import { parseProspectCsv, CSV_COLUMNS, type CsvRow, type CsvRowError } from '../lib/csv';
import { removeDuplicates } from '../lib/dedupe';
import { computeScore, normalizeSeniority, priorityForScore } from '../lib/scoring';
import { generateDraft } from '../lib/templates';
import { firstNameOf, lastNameOf, nowIso, uid } from '../lib/utils';
import { Button, Dialog } from './ui';
import { useToast } from './toast';

interface ImportSummary {
  imported: number;
  invalid: CsvRowError[];
  headerErrors: string[];
  duplicates: number;
}

export default function CsvImportDialog({
  open,
  onClose,
  workspace,
}: {
  open: boolean;
  onClose: () => void;
  workspace: Workspace;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const importRows = (rows: CsvRow[], errors: CsvRowError[], headerErrors: string[]) => {
    const state = getState();
    const existing = state.people.map((p) => ({
      fullName: p.fullName,
      companyName: state.companies.find((c) => c.id === p.companyId)?.name ?? '',
      linkedinUrl: p.linkedinUrl,
    }));
    const candidates = rows.map((r) => ({
      row: r,
      fullName: r.full_name ?? '',
      companyName: r.company ?? '',
      linkedinUrl: r.linkedin_url ?? '',
    }));
    const { unique, duplicates } = removeDuplicates(candidates, existing);

    const newCompanies = new Map<string, Company>();
    const people: Person[] = [];
    const prospects: Prospect[] = [];

    for (const c of unique) {
      const r = c.row;
      const companyName = r.company?.trim() || 'Unknown company';
      let company =
        state.companies.find((x) => x.name.toLowerCase() === companyName.toLowerCase()) ??
        newCompanies.get(companyName.toLowerCase());
      if (!company) {
        company = {
          id: uid(),
          name: companyName,
          website: r.company_website ?? '',
          industry: r.industry ?? '',
          city: '',
          country: r.country ?? '',
          size: '',
          type: '',
          description: '',
          relevantInitiatives: r.relevant_project ? [r.relevant_project] : [],
          commercialTrigger: r.commercial_trigger ?? r.relevant_project ?? '',
          score: 0,
          notes: '',
          isDemo: false,
        };
        newCompanies.set(companyName.toLowerCase(), company);
      }

      const person: Person = {
        id: uid(),
        fullName: c.fullName,
        firstName: firstNameOf(c.fullName),
        lastName: lastNameOf(c.fullName),
        title: r.title ?? '',
        companyId: company.id,
        city: r.city ?? '',
        country: r.country ?? '',
        linkedinUrl: r.linkedin_url ?? '',
        seniority: normalizeSeniority(r.title ?? ''),
        functionalArea: '',
        professionalSummary: r.notes ?? '',
        careerSummary: '',
        researchConfidence: 'medium',
        sourceReferences: ['Imported from CSV by the user'],
        isDemo: false,
      };
      people.push(person);

      const { score, breakdown } = computeScore(person, company, workspace);
      const angle = company.commercialTrigger
        ? `Reference ${company.commercialTrigger} and offer a relevant perspective.`
        : 'General introduction based on shared professional interests.';
      const draft = generateDraft(person, company, workspace, angle);
      const now = nowIso();
      prospects.push({
        id: uid(),
        workspaceId: workspace.id,
        personId: person.id,
        companyId: company.id,
        status: 'ready_for_review',
        priority: priorityForScore(score),
        score,
        scoreBreakdown: breakdown,
        fitReason: r.notes || `Imported prospect at ${companyName}.`,
        timingReason: company.commercialTrigger || 'Imported — timing set by the user.',
        outreachAngle: angle,
        recommendedService: workspace.services[0] ?? '',
        patternId: draft.patternId,
        originalDraft: draft.message,
        editedMessage: null,
        finalMessage: null,
        notes: r.notes ?? '',
        createdAt: now,
        reviewedAt: null,
        editedAt: null,
        sentAt: null,
        lastActivityAt: now,
        outcome: null,
        isDemo: false,
      });
    }

    addEntities({
      companies: [...newCompanies.values()],
      people,
      prospects,
      activities: prospects.map((p) =>
        logActivity(p.id, 'imported', 'Imported from CSV.', null, 'ready_for_review'),
      ),
    });
    setSummary({ imported: prospects.length, invalid: errors, headerErrors, duplicates });
    toast(`${prospects.length} prospects imported.`, 'success');
  };

  const handleFile = (file: File) => {
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { rows, errors, headerErrors } = parseProspectCsv(String(reader.result ?? ''));
        if (headerErrors.some((h) => h.startsWith('Missing required'))) {
          setSummary({ imported: 0, invalid: errors, headerErrors, duplicates: 0 });
        } else {
          importRows(rows, errors, headerErrors);
        }
      } finally {
        setBusy(false);
      }
    };
    reader.onerror = () => {
      setBusy(false);
      toast('Could not read the file.', 'error');
    };
    reader.readAsText(file);
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        setSummary(null);
        onClose();
      }}
      title="Import prospects from CSV"
    >
      {summary == null ? (
        <>
          <p className="text-sm text-slate-600">
            The file is processed <strong>entirely in your browser</strong> — nothing is uploaded
            anywhere.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Supported columns: <code className="text-[11px]">{CSV_COLUMNS.join(', ')}</code>. Only{' '}
            <code className="text-[11px]">full_name</code> is required.
          </p>
          <input
            ref={fileRef}
            data-testid="csv-file-input"
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={() => fileRef.current?.click()}
              data-testid="csv-choose-file"
            >
              <FileUp className="h-4 w-4" /> Choose CSV file
            </Button>
          </div>
        </>
      ) : (
        <div data-testid="csv-import-summary">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <Upload className="h-4 w-4 text-emerald-500" />
            {summary.imported} prospect{summary.imported === 1 ? '' : 's'} imported
            {summary.duplicates > 0 && `, ${summary.duplicates} duplicate(s) skipped`}.
          </p>
          {summary.headerErrors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-amber-600">
              {summary.headerErrors.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
          {summary.invalid.length > 0 && (
            <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-rose-100 bg-rose-50/50 p-3">
              <p className="mb-1 text-xs font-semibold text-rose-700">
                {summary.invalid.length} row(s) rejected:
              </p>
              <ul className="space-y-0.5 text-xs text-rose-600">
                {summary.invalid.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5 flex justify-end">
            <Button
              onClick={() => {
                setSummary(null);
                onClose();
              }}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
