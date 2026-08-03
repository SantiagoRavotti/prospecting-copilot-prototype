import { useMemo, useState } from 'react';
import { Building2, Globe, Search } from 'lucide-react';
import type { Company } from '../lib/types';
import { personById, updateCompany, useAppState, workspaceProspects } from '../lib/store';
import { formatDateTime } from '../lib/utils';
import { Badge, Button, Card, Dialog, EmptyState, Input, Textarea } from '../components/ui';
import { PriorityBadge, StatusBadge } from '../components/badges';
import { useToast } from '../components/toast';

export default function Companies() {
  const state = useAppState();
  const prospects = workspaceProspects(state);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Company | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const { toast } = useToast();

  const companies = useMemo(() => {
    const usedIds = new Set(prospects.map((p) => p.companyId));
    return state.companies
      .filter((c) => usedIds.has(c.id))
      .filter(
        (c) =>
          query.trim() === '' ||
          `${c.name} ${c.industry} ${c.country} ${c.type}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort((a, b) => b.score - a.score);
  }, [state.companies, prospects, query]);

  const related = useMemo(
    () => (selected ? prospects.filter((p) => p.companyId === selected.id) : []),
    [prospects, selected],
  );
  const activity = useMemo(() => {
    if (!selected) return [];
    const ids = new Set(related.map((p) => p.id));
    return state.activities
      .filter((a) => ids.has(a.prospectId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12);
  }, [state.activities, related, selected]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Companies</h1>

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search companies…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {companies.length === 0 ? (
        <EmptyState
          title="No companies in this workspace yet"
          body="Generate mock prospects or add prospects to see their companies here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => {
            const count = prospects.filter((p) => p.companyId === c.id).length;
            return (
              <button
                key={c.id}
                className="text-left"
                onClick={() => {
                  setSelected(c);
                  setNotesDraft(c.notes);
                }}
              >
                <Card className="h-full px-4 py-3.5 transition-shadow hover:shadow-pop">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <Building2 className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                        <p className="text-xs text-slate-400">
                          {c.industry || '—'} · {c.country || '—'}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                      {c.score}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-slate-500">{c.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {c.isDemo && (
                      <Badge className="border-dashed border-slate-300 bg-slate-50 text-slate-500">
                        Demo — fictional
                      </Badge>
                    )}
                    <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                      {count} prospect{count === 1 ? '' : 's'}
                    </Badge>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <Dialog
        open={selected != null}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
        wide
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>{selected.type || 'Organization'}</span>·<span>{selected.industry || '—'}</span>
              ·
              <span>
                {selected.city ? `${selected.city}, ` : ''}
                {selected.country}
              </span>
              ·<span>{selected.size ? `${selected.size} employees` : 'size unknown'}</span>
              {selected.website && (
                <a
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                  href={selected.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Globe className="h-3.5 w-3.5" /> website
                </a>
              )}
              <span className="ml-auto rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                Company score {selected.score}
              </span>
            </div>

            <p className="text-sm text-slate-600">{selected.description}</p>

            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Relevant signals
              </h3>
              <ul className="list-inside list-disc space-y-0.5 text-sm text-slate-600">
                {selected.commercialTrigger && <li>{selected.commercialTrigger}</li>}
                {selected.relevantInitiatives.map((i) => (
                  <li key={i}>{i}</li>
                ))}
                {!selected.commercialTrigger && selected.relevantInitiatives.length === 0 && (
                  <li className="text-slate-400">No signals recorded.</li>
                )}
              </ul>
            </div>

            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Related prospects
              </h3>
              <div className="space-y-1.5">
                {related.map((p) => {
                  const person = personById(state, p.personId);
                  return (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-3 py-2"
                    >
                      <span className="text-sm font-medium text-slate-800">{person?.fullName}</span>
                      <span className="text-xs text-slate-400">{person?.title}</span>
                      <span className="ml-auto flex items-center gap-1.5">
                        <PriorityBadge priority={p.priority} />
                        <StatusBadge status={p.status} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Outreach activity
              </h3>
              {activity.length === 0 ? (
                <p className="text-sm text-slate-400">No activity yet.</p>
              ) : (
                <ul className="space-y-1 text-xs text-slate-500">
                  {activity.map((a) => (
                    <li key={a.id}>
                      {formatDateTime(a.createdAt)} — {a.type.replace(/_/g, ' ')}
                      {a.newStatus ? ` → ${a.newStatus.replace(/_/g, ' ')}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Notes
              </h3>
              <Textarea
                rows={3}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    updateCompany(selected.id, { notes: notesDraft });
                    toast('Company notes saved.', 'success');
                  }}
                >
                  Save notes
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
