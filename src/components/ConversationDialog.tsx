// Per-prospect conversation thread. Sent messages are logged automatically on
// "Mark as sent"; replies are pasted manually from LinkedIn by the user.

import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import type { Person, Prospect } from '../lib/types';
import { logConversation, useAppState } from '../lib/store';
import { cn, formatDateTime } from '../lib/utils';
import { Button, Dialog, EmptyState, Textarea } from './ui';
import { useToast } from './toast';

export default function ConversationDialog({
  prospect,
  person,
  open,
  onClose,
}: {
  prospect: Prospect;
  person: Person;
  open: boolean;
  onClose: () => void;
}) {
  const state = useAppState();
  const { toast } = useToast();
  const [reply, setReply] = useState('');
  const thread = (state.conversations ?? [])
    .filter((c) => c.prospectId === prospect.id)
    .sort((a, b) => a.at.localeCompare(b.at));

  return (
    <Dialog open={open} onClose={onClose} title={`Conversación — ${person.fullName}`} wide>
      <div className="max-h-80 space-y-2 overflow-y-auto pb-2" data-testid="conversation-thread">
        {thread.length === 0 ? (
          <EmptyState
            title="Sin mensajes registrados"
            body="Al marcar como enviado se registra el mensaje automáticamente. Las respuestas las pegás acá."
          />
        ) : (
          thread.map((c) => (
            <div
              key={c.id}
              className={cn(
                'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                c.direction === 'sent'
                  ? 'ml-auto bg-brand-50 text-slate-800'
                  : 'bg-slate-100 text-slate-800',
              )}
            >
              <p className="whitespace-pre-wrap">{c.text}</p>
              <p className="mt-1 text-[10px] text-slate-400">
                {c.direction === 'sent' ? 'Enviado' : 'Recibido'} · {formatDateTime(c.at)}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Registrar respuesta recibida (pegada de LinkedIn)
        </p>
        <Textarea
          rows={3}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Pegá acá la respuesta de la persona…"
          data-testid="conversation-reply"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            disabled={reply.trim() === ''}
            onClick={() => {
              logConversation(prospect.id, 'received', reply.trim());
              setReply('');
              toast('Respuesta registrada. Estado actualizado si correspondía.', 'success');
            }}
            data-testid="conversation-log"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" /> Registrar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
