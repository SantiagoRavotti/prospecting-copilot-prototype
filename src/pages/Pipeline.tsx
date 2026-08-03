// Working Kanban board with HTML5 drag & drop. Status changes persist locally
// and are logged as activities.

import { useMemo, useState } from 'react';
import type { Prospect, ProspectStatus } from '../lib/types';
import { ALL_STATUSES } from '../lib/types';
import {
  changeStatus,
  companyById,
  personById,
  useAppState,
  workspaceProspects,
} from '../lib/store';
import { STATUS_LABELS } from '../lib/labels';
import { cn } from '../lib/utils';
import { PriorityBadge } from '../components/badges';
import { useToast } from '../components/toast';

export default function Pipeline() {
  const state = useAppState();
  const prospects = workspaceProspects(state);
  const { toast } = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ProspectStatus | null>(null);

  const byStatus = useMemo(() => {
    const map = new Map<ProspectStatus, Prospect[]>();
    for (const s of ALL_STATUSES) map.set(s, []);
    for (const p of prospects) map.get(p.status)?.push(p);
    for (const list of map.values()) list.sort((a, b) => b.score - a.score);
    return map;
  }, [prospects]);

  const drop = (status: ProspectStatus) => {
    if (!dragId) return;
    const prospect = prospects.find((p) => p.id === dragId);
    if (prospect && prospect.status !== status) {
      changeStatus(dragId, status, 'Moved on the pipeline board.');
      const person = personById(state, prospect.personId);
      toast(`${person?.fullName ?? 'Prospect'} → ${STATUS_LABELS[status]}.`, 'success');
    }
    setDragId(null);
    setDragOver(null);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Pipeline</h1>
        <p className="text-xs text-slate-400">
          Drag cards between columns — changes are saved locally and logged.
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {ALL_STATUSES.map((status) => {
          const list = byStatus.get(status) ?? [];
          return (
            <div
              key={status}
              data-testid={`pipeline-column-${status}`}
              className={cn(
                'flex w-60 shrink-0 flex-col rounded-xl border bg-slate-50/70 transition-colors',
                dragOver === status ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200',
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                drop(status);
              }}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {STATUS_LABELS[status]}
                </span>
                <span className="rounded-full bg-slate-200 px-1.5 text-xs text-slate-600">
                  {list.length}
                </span>
              </div>
              <div className="flex-1 space-y-2 px-2 pb-2">
                {list.map((p) => {
                  const person = personById(state, p.personId);
                  const company = companyById(state, p.companyId);
                  return (
                    <div
                      key={p.id}
                      draggable
                      data-testid={`pipeline-card-${p.id}`}
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOver(null);
                      }}
                      className={cn(
                        'cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-card active:cursor-grabbing',
                        dragId === p.id && 'opacity-50',
                      )}
                    >
                      <p className="text-sm font-medium leading-tight text-slate-800">
                        {person?.fullName}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">{company?.name}</p>
                      <div className="mt-1.5 flex items-center justify-between">
                        <PriorityBadge priority={p.priority} />
                        <span className="text-xs font-semibold text-slate-500">{p.score}</span>
                      </div>
                    </div>
                  );
                })}
                {list.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 px-2 py-4 text-center text-[11px] text-slate-300">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
