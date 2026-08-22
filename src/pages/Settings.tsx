// Workspace configuration + data management. Everything persists locally.

import { useEffect, useRef, useState } from 'react';
import { Download, RotateCcw, Upload } from 'lucide-react';
import type { Language, MessageLength, Tone, Workspace } from '../lib/types';
import {
  activeWorkspace,
  isValidBackup,
  replaceState,
  resetDemoData,
  updateWorkspace,
  useAppState,
} from '../lib/store';
import { exportBackup } from '../lib/exporters';
import { importBackupToCloud } from '../lib/backupImport';
import { isCloudMode, supabase } from '../lib/supabaseClient';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  Select,
  Textarea,
} from '../components/ui';
import { useToast } from '../components/toast';

function listToText(list: string[]): string {
  return list.join('\n');
}
function textToList(text: string): string[] {
  return text
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function Settings() {
  const state = useAppState();
  const workspace = activeWorkspace(state);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Local draft of the workspace being edited; autosaves on blur/change.
  const [draft, setDraft] = useState<Workspace>(workspace);
  useEffect(() => setDraft(workspace), [workspace]);

  const commit = (patch: Partial<Workspace>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    updateWorkspace(workspace.id, patch);
  };

  const commitRules = (patch: Partial<Workspace['targetingRules']>) => {
    commit({ targetingRules: { ...draft.targetingRules, ...patch } });
  };

  const importBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result ?? ''));
        if (!isValidBackup(parsed)) {
          toast('Not a valid Prospecting Copilot backup file.', 'error');
          return;
        }
        if (isCloudMode() && supabase) {
          // One-shot migration of prototype data into the cloud account.
          const { data } = await supabase.auth.getUser();
          if (!data.user) {
            toast('Sign in first to import into the cloud.', 'error');
            return;
          }
          const summary = await importBackupToCloud(parsed, data.user.id);
          toast(
            `Imported to cloud: ${summary.prospects} prospects, ${summary.opportunities} opportunities.`,
            'success',
          );
        } else {
          replaceState(parsed);
          toast('Backup imported — all local data replaced.', 'success');
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not parse the backup file.', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>

      <Card>
        <CardHeader
          title={`Workspace: ${workspace.name}`}
          subtitle="Changes save automatically to this browser's local storage."
        />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <Field label="Sender name">
            <Input
              value={draft.senderName}
              onChange={(e) => commit({ senderName: e.target.value })}
              data-testid="sender-name"
            />
          </Field>
          <Field label="Sender title">
            <Input
              value={draft.senderTitle}
              onChange={(e) => commit({ senderTitle: e.target.value })}
            />
          </Field>
          <Field label="Sender company">
            <Input
              value={draft.senderCompany}
              onChange={(e) => commit({ senderCompany: e.target.value })}
            />
          </Field>
          <Field label="Daily candidate target">
            <Input
              type="number"
              min={1}
              value={draft.dailyTarget}
              onChange={(e) =>
                commit({ dailyTarget: Math.max(1, Number.parseInt(e.target.value, 10) || 1) })
              }
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Sender biography">
              <Textarea
                rows={2}
                value={draft.senderBio}
                onChange={(e) => commit({ senderBio: e.target.value })}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field
              label="Value proposition"
              hint="Used by the message templates as {{shortValueProposition}}."
            >
              <Textarea
                rows={2}
                value={draft.valueProposition}
                onChange={(e) => commit({ valueProposition: e.target.value })}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Services (one per line)">
              <Textarea
                rows={3}
                value={listToText(draft.services)}
                onChange={(e) => commit({ services: textToList(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Preferred language">
            <Select
              value={draft.defaultLanguage}
              onChange={(e) => commit({ defaultLanguage: e.target.value as Language })}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
            </Select>
          </Field>
          <Field label="Preferred tone">
            <Select
              value={draft.defaultTone}
              onChange={(e) => commit({ defaultTone: e.target.value as Tone })}
            >
              <option value="professional">Professional</option>
              <option value="warm">Warm</option>
              <option value="direct">Direct</option>
              <option value="curious">Curious</option>
            </Select>
          </Field>
          <Field label="Preferred message length">
            <Select
              value={draft.preferredMessageLength}
              onChange={(e) => commit({ preferredMessageLength: e.target.value as MessageLength })}
            >
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Targeting rules"
          subtitle="Drive demo scoring and future candidate discovery."
        />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <Field label="Target countries (one per line)">
            <Textarea
              rows={4}
              value={listToText(draft.targetingRules.targetCountries)}
              onChange={(e) => commitRules({ targetCountries: textToList(e.target.value) })}
            />
          </Field>
          <Field label="Target industries">
            <Textarea
              rows={4}
              value={listToText(draft.targetingRules.targetIndustries)}
              onChange={(e) => commitRules({ targetIndustries: textToList(e.target.value) })}
            />
          </Field>
          <Field label="Target roles">
            <Textarea
              rows={4}
              value={listToText(draft.targetingRules.targetRoles)}
              onChange={(e) => commitRules({ targetRoles: textToList(e.target.value) })}
            />
          </Field>
          <Field label="Target company types">
            <Textarea
              rows={4}
              value={listToText(draft.targetingRules.targetCompanyTypes)}
              onChange={(e) => commitRules({ targetCompanyTypes: textToList(e.target.value) })}
            />
          </Field>
          <Field label="Keywords">
            <Textarea
              rows={3}
              value={listToText(draft.targetingRules.keywords)}
              onChange={(e) => commitRules({ keywords: textToList(e.target.value) })}
            />
          </Field>
          <Field label="Negative keywords">
            <Textarea
              rows={3}
              value={listToText(draft.targetingRules.negativeKeywords)}
              onChange={(e) => commitRules({ negativeKeywords: textToList(e.target.value) })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Excluded companies">
              <Textarea
                rows={2}
                value={listToText(draft.targetingRules.excludedCompanies)}
                onChange={(e) => commitRules({ excludedCompanies: textToList(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Data management"
          subtitle="All data lives in this browser. Nothing is uploaded anywhere."
        />
        <div className="flex flex-wrap gap-2 px-5 py-4">
          <Button
            variant="outline"
            onClick={() => exportBackup(state)}
            data-testid="settings-export-backup"
          >
            <Download className="h-4 w-4" /> Export complete backup
          </Button>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            data-testid="settings-import-backup"
          >
            <Upload className="h-4 w-4" /> Import backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importBackup(f);
              e.target.value = '';
            }}
          />
          {!isCloudMode() && (
            <Button variant="danger" onClick={() => setConfirmReset(true)} data-testid="reset-demo">
              <RotateCcw className="h-4 w-4" /> Reset demo data
            </Button>
          )}
        </div>
      </Card>

      <p className="text-xs text-slate-400">
        Prototype notice: no external APIs are connected. Demo prospects are fictional. The local
        message drafts are template-generated, not AI-generated.
      </p>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemoData();
          toast('Demo data restored. All local changes were discarded.', 'success');
        }}
        title="Reset demo data?"
        body="This discards ALL local changes (prospects, messages, statuses, follow-ups, workspace settings) and restores the original demo dataset. Export a backup first if you want to keep anything."
        confirmLabel="Reset everything"
        danger
      />
    </div>
  );
}
