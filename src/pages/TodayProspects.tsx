import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Plus,
  Sparkles,
  Table as TableIcon,
} from 'lucide-react';
import type { Priority, Prospect } from '../lib/types';
import { activeWorkspace, companyById, markSent, personById, useAppState } from '../lib/store';
import { currentMessage } from '../components/MessageEditor';
import { PRIORITY_LABELS } from '../lib/labels';
import { copyToClipboard } from '../lib/utils';
import { Button, EmptyState, Kbd, Progress, Select } from '../components/ui';
import { PriorityBadge, StatusBadge } from '../components/badges';
import ProspectCard from '../components/ProspectCard';
import GenerateDialog from '../components/GenerateDialog';
import AddProspectDialog from '../components/AddProspectDialog';
import { useToast } from '../components/toast';

type Mode = 'card' | 'table';
type PriorityFilter = Priority | 'all';

const PRIORITY_ORDER: Record<Priority, number> = {
  hot: 0,
  strong_fit: 1,
  networking: 2,
  low_confidence: 3,
};

export default function TodayProspects() {
  const state = useAppState();
  const workspace = activeWorkspace(state);
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('card');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [index, setIndex] = useState(0);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Queue: prospects ready for review in the active workspace, hot first.
  const queue = useMemo(() => {
    return state.prospects
      .filter(
        (p) =>
          p.workspaceId === workspace.id &&
          p.status === 'ready_for_review' &&
          (priorityFilter === 'all' || p.priority === priorityFilter),
      )
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.score - a.score);
  }, [state.prospects, workspace.id, priorityFilter]);

  // Batch progress: how much of today's created-or-reviewed work is done.
  const reviewedToday = useMemo(() => {
    const today = new Date().toDateString();
    return state.prospects.filter(
      (p) =>
        p.workspaceId === workspace.id &&
        p.reviewedAt != null &&
        new Date(p.reviewedAt).toDateString() === today,
    ).length;
  }, [state.prospects, workspace.id]);
  const totalToday = queue.length + reviewedToday;
  const progressPct = totalToday === 0 ? 0 : (reviewedToday / totalToday) * 100;

  const safeIndex = queue.length === 0 ? 0 : Math.min(index, queue.length - 1);
  const current: Prospect | undefined = queue[safeIndex];
  const person = current ? personById(state, current.personId) : undefined;
  const company = current ? companyById(state, current.companyId) : undefined;

  const advance = useCallback(() => {
    // The queue re-computes after actions; keep the same index (next item slides in).
    setIndex((i) => Math.max(0, Math.min(i, queue.length - 2)));
  }, [queue.length]);

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, Math.max(0, queue.length - 1))),
    [queue.length],
  );
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Keyboard shortcuts (suppressed while typing).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable)
        return;
      if (mode !== 'card' || !current || !person) return;
      const key = e.key.toLowerCase();
      if (key === 'arrowright') {
        next();
      } else if (key === 'arrowleft') {
        prev();
      } else if (key === 'c') {
        void copyToClipboard(currentMessage(current)).then((ok) =>
          toast(
            ok ? 'Message copied to clipboard.' : 'Clipboard unavailable.',
            ok ? 'success' : 'error',
          ),
        );
      } else if (key === 'o') {
        window.open(person.linkedinUrl, '_blank', 'noopener,noreferrer');
      } else if (key === 's') {
        markSent(current.id);
        toast(`${person.fullName} marked as sent.`, 'success');
        advance();
      } else if (key === 'k') {
        import('../lib/store').then(({ skipProspect }) => {
          skipProspect(current.id);
          toast(`${person.fullName} skipped.`, 'info');
          advance();
        });
      } else if (key === 'l') {
        import('../lib/store').then(({ changeStatus }) => {
          changeStatus(current.id, 'saved_for_later', 'Saved for later during review.');
          toast(`${person.fullName} saved for later.`, 'info');
          advance();
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, current, person, next, prev, advance, toast]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Today's Prospects</h1>
          <p className="text-sm text-slate-500">
            {workspace.name} · daily target {workspace.dailyTarget}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddOpen(true)}
            data-testid="add-prospect"
          >
            <Plus className="h-4 w-4" /> Add prospect
          </Button>
          <Button size="sm" onClick={() => setGenerateOpen(true)} data-testid="generate-button">
            <Sparkles className="h-4 w-4" /> Generate today's mock prospects
          </Button>
        </div>
      </div>

      {/* Batch progress */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
          <span>
            Batch progress — {reviewedToday} reviewed today, {queue.length} in queue
          </span>
          <span>{Math.round(progressPct)}%</span>
        </div>
        <Progress value={progressPct} />
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          <button
            className={
              mode === 'card'
                ? 'flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white'
                : 'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800'
            }
            onClick={() => setMode('card')}
            data-testid="mode-card"
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Card review
          </button>
          <button
            className={
              mode === 'table'
                ? 'flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white'
                : 'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800'
            }
            onClick={() => setMode('table')}
            data-testid="mode-table"
          >
            <TableIcon className="h-3.5 w-3.5" /> Table
          </button>
        </div>
        <Select
          aria-label="Filter by priority"
          className="w-44"
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value as PriorityFilter);
            setIndex(0);
          }}
        >
          <option value="all">All priorities</option>
          {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
        {mode === 'card' && queue.length > 0 && (
          <div className="ml-auto flex items-center gap-2 text-sm text-slate-500">
            <Button
              variant="ghost"
              size="sm"
              onClick={prev}
              disabled={safeIndex === 0}
              aria-label="Previous prospect"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span data-testid="queue-position">
              {safeIndex + 1} / {queue.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={next}
              disabled={safeIndex >= queue.length - 1}
              aria-label="Next prospect"
              data-testid="next-prospect"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {queue.length === 0 ? (
        <EmptyState
          title="No prospects ready for review"
          body="Generate a mock batch, add a prospect manually, or import a CSV from the People page."
          action={
            <Button onClick={() => setGenerateOpen(true)}>
              <Sparkles className="h-4 w-4" /> Generate today's mock prospects
            </Button>
          }
        />
      ) : mode === 'card' && current && person && company ? (
        <>
          <ProspectCard
            prospect={current}
            person={person}
            company={company}
            workspace={workspace}
            onAdvance={advance}
          />
          <p className="mt-3 text-center text-xs text-slate-400">
            Shortcuts: <Kbd>C</Kbd> copy · <Kbd>O</Kbd> LinkedIn · <Kbd>S</Kbd> sent · <Kbd>K</Kbd>{' '}
            skip · <Kbd>L</Kbd> later · <Kbd>←</Kbd>/<Kbd>→</Kbd> navigate
          </p>
        </>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {queue.map((p, i) => {
                const per = personById(state, p.personId);
                const comp = companyById(state, p.companyId);
                return (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-800">{per?.fullName}</p>
                      <p className="text-xs text-slate-400">{per?.title}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{comp?.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{per?.country}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700">{p.score}</td>
                    <td className="px-4 py-2.5">
                      <PriorityBadge priority={p.priority} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setMode('card');
                          setIndex(i);
                        }}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <GenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        workspace={workspace}
        onDone={(n) => {
          setIndex(0);
          toast(`${n} mock prospects ready for review.`, 'success');
        }}
      />
      <AddProspectDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        workspace={workspace}
        onCreated={() => setIndex(0)}
      />
    </div>
  );
}
