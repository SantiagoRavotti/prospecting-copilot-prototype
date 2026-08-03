import { useMemo, useState } from 'react';
import { CalendarPlus, Check, Pencil } from 'lucide-react';
import type { FollowUp } from '../lib/types';
import {
  completeFollowUp,
  createFollowUp,
  personById,
  updateFollowUp,
  useAppState,
  workspaceProspects,
} from '../lib/store';
import { daysFromNow, formatDate, isPast, isToday, startOfToday } from '../lib/utils';
import { Button, Card, Dialog, EmptyState, Input, Select, Tabs, Textarea } from '../components/ui';
import { StatusBadge } from '../components/badges';
import { useToast } from '../components/toast';

type Tab = 'due_today' | 'overdue' | 'upcoming' | 'accepted_awaiting' | 'replied_awaiting';

export default function FollowUps() {
  const state = useAppState();
  const prospects = workspaceProspects(state);
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('due_today');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FollowUp | null>(null);
  const [formProspect, setFormProspect] = useState('');
  const [formDays, setFormDays] = useState('3');
  const [formMsg, setFormMsg] = useState('');

  const prospectIds = useMemo(() => new Set(prospects.map((p) => p.id)), [prospects]);
  const pending = useMemo(
    () => state.followUps.filter((f) => f.status === 'pending' && prospectIds.has(f.prospectId)),
    [state.followUps, prospectIds],
  );

  const buckets = useMemo(() => {
    const todayStart = startOfToday().getTime();
    return {
      due_today: pending.filter((f) => isToday(f.dueAt)),
      overdue: pending.filter(
        (f) => new Date(f.dueAt).getTime() < todayStart && !isToday(f.dueAt) && isPast(f.dueAt),
      ),
      upcoming: pending.filter(
        (f) => new Date(f.dueAt).getTime() > todayStart && !isToday(f.dueAt),
      ),
      accepted_awaiting: prospects.filter((p) => p.status === 'connection_accepted'),
      replied_awaiting: prospects.filter((p) => p.status === 'replied'),
    };
  }, [pending, prospects]);

  const tabs = [
    { id: 'due_today' as Tab, label: 'Due today', count: buckets.due_today.length },
    { id: 'overdue' as Tab, label: 'Overdue', count: buckets.overdue.length },
    { id: 'upcoming' as Tab, label: 'Upcoming', count: buckets.upcoming.length },
    {
      id: 'accepted_awaiting' as Tab,
      label: 'Accepted, awaiting message',
      count: buckets.accepted_awaiting.length,
    },
    {
      id: 'replied_awaiting' as Tab,
      label: 'Replied, awaiting response',
      count: buckets.replied_awaiting.length,
    },
  ];

  const renderFollowUp = (f: FollowUp) => {
    const prospect = prospects.find((p) => p.id === f.prospectId);
    const person = prospect ? personById(state, prospect.personId) : undefined;
    return (
      <Card key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800">
            {person?.fullName ?? 'Unknown prospect'}
          </p>
          <p className="text-xs text-slate-500">{f.message}</p>
        </div>
        <span
          className={
            isPast(f.dueAt) && !isToday(f.dueAt)
              ? 'text-xs font-medium text-rose-600'
              : 'text-xs text-slate-400'
          }
        >
          Due {formatDate(f.dueAt)}
        </span>
        {prospect && <StatusBadge status={prospect.status} />}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditTarget(f);
            setFormMsg(f.message);
            setFormDays('0');
          }}
          aria-label="Edit follow-up"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            completeFollowUp(f.id);
            toast('Follow-up completed.', 'success');
          }}
          data-testid="complete-followup"
        >
          <Check className="h-3.5 w-3.5" /> Complete
        </Button>
      </Card>
    );
  };

  const list = tab === 'accepted_awaiting' || tab === 'replied_awaiting' ? null : buckets[tab];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Follow-ups</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="new-followup">
          <CalendarPlus className="h-4 w-4" /> New follow-up
        </Button>
      </div>

      <div className="mb-4">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      {list != null ? (
        list.length === 0 ? (
          <EmptyState title="Nothing here" body="No follow-ups in this bucket right now." />
        ) : (
          <div className="space-y-2">{list.map(renderFollowUp)}</div>
        )
      ) : (
        <div className="space-y-2">
          {(tab === 'accepted_awaiting' ? buckets.accepted_awaiting : buckets.replied_awaiting).map(
            (p) => {
              const person = personById(state, p.personId);
              return (
                <Card key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">{person?.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {tab === 'accepted_awaiting'
                        ? 'Connection accepted — send a first message manually on LinkedIn.'
                        : 'Replied — respond manually on LinkedIn.'}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      person && window.open(person.linkedinUrl, '_blank', 'noopener,noreferrer')
                    }
                  >
                    Open LinkedIn
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFormProspect(p.id);
                      setCreateOpen(true);
                    }}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" /> Remind me
                  </Button>
                </Card>
              );
            },
          )}
          {(tab === 'accepted_awaiting' ? buckets.accepted_awaiting : buckets.replied_awaiting)
            .length === 0 && (
            <EmptyState title="Nothing here" body="No prospects in this state right now." />
          )}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New follow-up">
        <div className="space-y-3">
          <label className="block text-sm text-slate-600">
            Prospect
            <Select
              className="mt-1"
              value={formProspect}
              onChange={(e) => setFormProspect(e.target.value)}
              data-testid="followup-prospect"
            >
              <option value="">Select a prospect…</option>
              {prospects.map((p) => {
                const person = personById(state, p.personId);
                return (
                  <option key={p.id} value={p.id}>
                    {person?.fullName} — {person?.title}
                  </option>
                );
              })}
            </Select>
          </label>
          <label className="block text-sm text-slate-600">
            Due in (days)
            <Input
              type="number"
              min={0}
              className="mt-1"
              value={formDays}
              onChange={(e) => setFormDays(e.target.value)}
              data-testid="followup-days"
            />
          </label>
          <label className="block text-sm text-slate-600">
            Reminder
            <Textarea
              rows={3}
              className="mt-1"
              value={formMsg}
              onChange={(e) => setFormMsg(e.target.value)}
              placeholder="What should happen at this follow-up?"
              data-testid="followup-message"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={formProspect === '' || formMsg.trim() === ''}
            onClick={() => {
              createFollowUp(
                formProspect,
                daysFromNow(Number.parseInt(formDays, 10) || 0),
                formMsg,
              );
              setCreateOpen(false);
              setFormMsg('');
              toast('Follow-up created.', 'success');
            }}
            data-testid="followup-create"
          >
            Create
          </Button>
        </div>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTarget != null} onClose={() => setEditTarget(null)} title="Edit follow-up">
        <div className="space-y-3">
          <label className="block text-sm text-slate-600">
            Reminder
            <Textarea
              rows={3}
              className="mt-1"
              value={formMsg}
              onChange={(e) => setFormMsg(e.target.value)}
            />
          </label>
          <label className="block text-sm text-slate-600">
            Reschedule: due in (days from now)
            <Input
              type="number"
              min={0}
              className="mt-1"
              value={formDays}
              onChange={(e) => setFormDays(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditTarget(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (editTarget) {
                updateFollowUp(editTarget.id, {
                  message: formMsg,
                  dueAt: daysFromNow(Number.parseInt(formDays, 10) || 0),
                });
                toast('Follow-up updated.', 'success');
              }
              setEditTarget(null);
            }}
          >
            Save
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
