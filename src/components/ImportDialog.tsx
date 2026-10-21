// "Importar resultado de ChatGPT": choose the JSON file ChatGPT produced or paste
// its answer, review a preview (new / updated / duplicate / errors / warnings),
// then confirm. Nothing is saved before confirming; the text stays in the box
// when there are errors, so it can be corrected and re-checked.

import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, XCircle } from 'lucide-react';
import { confirmImport, previewResult } from '../lib/campaignStore';
import type { CandidateAction, ImportPreview } from '../lib/batchExchange';
import type { Campaign } from '../lib/types';
import { cn } from '../lib/utils';
import { Badge, Button, Dialog, Textarea } from './ui';
import { useToast } from './toast';

export interface ImportDraft {
  text: string;
  input: 'file' | 'paste';
  fileName?: string;
}

const ACTION_LABEL: Record<CandidateAction, { label: string; cls: string }> = {
  create: { label: 'Nueva', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  update: { label: 'Actualizada', cls: 'border-sky-200 bg-sky-50 text-sky-700' },
  unchanged: { label: 'Sin cambios', cls: 'border-slate-200 bg-slate-50 text-slate-500' },
  duplicate: { label: 'Duplicada: no se importa', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  invalid: { label: 'Con errores: no se importa', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
};

export default function ImportDialog({
  open,
  onClose,
  campaign,
  draft,
  setDraft,
}: {
  open: boolean;
  onClose: () => void;
  campaign: Campaign;
  draft: ImportDraft;
  setDraft: (d: ImportDraft) => void;
}) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const review = (d: ImportDraft = draft) => {
    setPreview(previewResult(d.text, { campaignId: campaign.id, input: d.input, fileName: d.fileName }));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const d: ImportDraft = { text, input: 'file', fileName: file.name };
    setDraft(d);
    review(d);
  };

  const confirm = () => {
    setBusy(true);
    try {
      const { record } = confirmImport(draft.text, { campaignId: campaign.id, input: draft.input, fileName: draft.fileName });
      toast(`Importado: ${record.created} nuevas, ${record.updated} actualizadas.`, 'success');
      setDraft({ text: '', input: 'paste' });
      setPreview(null);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo importar.', 'error');
      review(); // text is kept; show the current verdict
    } finally {
      setBusy(false);
    }
  };

  const importable = preview ? preview.counts.create + preview.counts.update : 0;

  return (
    <Dialog open={open} onClose={onClose} title={`Importar resultado de ChatGPT — ${campaign.name}`} wide>
      <div className="space-y-3 text-sm" data-testid="import-dialog">
        <p className="text-slate-600">
          Elegí el archivo JSON o pegá la respuesta de ChatGPT. La app valida el formato, la campaña y la tarea, y te muestra qué pasaría antes de guardar nada.
          Las fuentes las aporta ChatGPT: la app las guarda pero no las verificó.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json,text/plain"
            className="hidden"
            data-testid="import-file"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} data-testid="import-file-button">
            <FileUp className="h-4 w-4" /> Elegir archivo JSON
          </Button>
          {draft.fileName && draft.input === 'file' && <span className="text-xs text-slate-500">{draft.fileName}</span>}
        </div>
        <Textarea
          rows={9}
          placeholder="…o pegá acá la respuesta de ChatGPT (con o sin bloque de código)."
          value={draft.text}
          onChange={(e) => {
            setDraft({ text: e.target.value, input: 'paste' });
            setPreview(null);
          }}
          data-testid="import-text"
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => review()} disabled={!draft.text.trim()} data-testid="import-review">
            Revisar
          </Button>
          {draft.text && (
            <Button
              variant="ghost"
              onClick={() => {
                setDraft({ text: '', input: 'paste' });
                setPreview(null);
              }}
            >
              Limpiar texto
            </Button>
          )}
        </div>

        {preview && (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3" data-testid="import-preview">
            {preview.fatal.length > 0 && (
              <ul className="space-y-1 text-rose-700" data-testid="import-fatal">
                {preview.fatal.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            )}
            {preview.globalWarnings.length > 0 && (
              <ul className="space-y-1 text-amber-700" data-testid="import-global-warnings">
                {preview.globalWarnings.map((w, i) => (
                  <li key={i} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}
                  </li>
                ))}
              </ul>
            )}
            {preview.candidates.length > 0 && (
              <>
                <p className="text-xs text-slate-500" data-testid="import-counts">
                  {preview.counts.create} nuevas · {preview.counts.update} actualizadas · {preview.counts.unchanged} sin cambios ·{' '}
                  {preview.counts.duplicate} duplicadas · {preview.counts.invalid} con errores
                </p>
                <ul className="divide-y divide-slate-100">
                  {preview.candidates.map((c) => (
                    <li key={c.index} className="space-y-1 py-2" data-testid="import-candidate" data-action={c.action}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{c.name}</span>
                        <span className="text-slate-500">
                          {[c.title, c.company].filter(Boolean).join(' · ')}
                        </span>
                        <Badge className={ACTION_LABEL[c.action].cls}>{ACTION_LABEL[c.action].label}</Badge>
                      </div>
                      {c.note && <p className="text-xs text-slate-500">{c.note}</p>}
                      {c.errors.map((e, i) => (
                        <p key={`e${i}`} className="flex gap-1.5 text-xs text-rose-700">
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {e}
                        </p>
                      ))}
                      {c.warnings.map((w, i) => (
                        <p key={`w${i}`} className={cn('flex gap-1.5 text-xs text-amber-700')}>
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                        </p>
                      ))}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {preview.fatal.length === 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button onClick={confirm} disabled={!preview.canConfirm || busy} loading={busy} data-testid="import-confirm">
                  <CheckCircle2 className="h-4 w-4" />
                  {preview.canConfirm ? `Importar ${importable} ficha${importable === 1 ? '' : 's'}` : 'Nada nuevo que importar'}
                </Button>
                {preview.counts.invalid > 0 && preview.canConfirm && (
                  <span className="text-xs text-slate-500">
                    Las {preview.counts.invalid} con errores no se importan; corregí el texto y volvé a revisar si las querés.
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
