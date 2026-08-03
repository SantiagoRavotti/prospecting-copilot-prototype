// Editable LinkedIn connection message with draft/edited/final lifecycle.
// The draft is produced by the LOCAL template engine — labeled
// "Prototype-generated message"; no AI API is involved.

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, RotateCcw, Undo2 } from 'lucide-react';
import type { Prospect } from '../lib/types';
import { saveMessage } from '../lib/store';
import { charCount, copyToClipboard } from '../lib/utils';
import { Button, ConfirmDialog, Kbd, Textarea } from './ui';
import { useToast } from './toast';

const LINKEDIN_INVITE_LIMIT = 300;

export function currentMessage(prospect: Prospect): string {
  return prospect.editedMessage ?? prospect.originalDraft;
}

export default function MessageEditor({ prospect }: { prospect: Prospect }) {
  const { toast } = useToast();
  const [text, setText] = useState(() => currentMessage(prospect));
  const [confirmReset, setConfirmReset] = useState(false);
  const [copied, setCopied] = useState(false);
  const undoStack = useRef<string[]>([]);
  const savedText = useRef(currentMessage(prospect));

  // Reload when navigating to a different prospect.
  useEffect(() => {
    const msg = currentMessage(prospect);
    setText(msg);
    savedText.current = msg;
    undoStack.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospect.id]);

  const count = charCount(text);
  const dirty = text !== savedText.current;
  const isEdited = prospect.editedMessage != null;

  const save = () => {
    undoStack.current.push(savedText.current);
    saveMessage(prospect.id, text);
    savedText.current = text;
    toast('Message saved.', 'success');
  };

  const undo = () => {
    const previous = undoStack.current.pop();
    if (previous == null) {
      toast('Nothing to undo.', 'info');
      return;
    }
    setText(previous);
    saveMessage(prospect.id, previous);
    savedText.current = previous;
    toast('Last edit undone.', 'success');
  };

  const reset = () => {
    undoStack.current.push(savedText.current);
    setText(prospect.originalDraft);
    saveMessage(prospect.id, prospect.originalDraft);
    savedText.current = prospect.originalDraft;
    toast('Message reset to the original draft.', 'success');
  };

  const copy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast('Message copied to clipboard.', 'success');
    } else {
      toast('Could not access the clipboard — copy manually.', 'error');
    }
  };

  return (
    <div data-testid="message-editor">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-600">
            Prototype-generated message
          </span>
          {isEdited && (
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              Edited
            </span>
          )}
        </div>
        <span
          data-testid="char-count"
          className={
            count > LINKEDIN_INVITE_LIMIT
              ? 'text-xs font-semibold text-rose-600'
              : 'text-xs text-slate-400'
          }
        >
          {count} / {LINKEDIN_INVITE_LIMIT} characters
        </span>
      </div>

      <Textarea
        data-testid="message-textarea"
        aria-label="LinkedIn connection message"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="text-[15px]"
      />
      {count > LINKEDIN_INVITE_LIMIT && (
        <p className="mt-1 text-xs text-rose-600">
          LinkedIn connection notes are limited to {LINKEDIN_INVITE_LIMIT} characters.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={save}
          disabled={!dirty}
          data-testid="save-message"
        >
          <Check className="h-3.5 w-3.5" /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={undo} data-testid="undo-message">
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirmReset(true)}
          disabled={!isEdited && !dirty}
          data-testid="reset-message"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset to draft
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={copy} data-testid="copy-message">
          <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied!' : 'Copy'} <Kbd>C</Kbd>
        </Button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={reset}
        title="Reset message?"
        body="This replaces the current text with the original prototype-generated draft. Your edits will be kept in the undo history for this session."
        confirmLabel="Reset"
      />
    </div>
  );
}
