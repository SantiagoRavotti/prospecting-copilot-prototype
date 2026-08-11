// Tenders & Opportunities — commercial-intelligence module (prototype).
// Sub-views: Search, Saved, Pipeline (kanban), Sources, Alerts.

import { useMemo, useState } from 'react';
import { Bell, Download, Plus, Search as SearchIcon, Trash2 } from 'lucide-react';
import type {
  Opportunity,
  OpportunityAlert,
  OpportunityStatus,
  OpportunityType,
} from '../lib/opportunityTypes';
import { OPPORTUNITY_STATUSES, OPPORTUNITY_TYPE_LABELS } from '../lib/opportunityTypes';
import { daysUntil } from '../lib/opportunityScoring';
import { OPPORTUNITY_STATUS_LABELS } from '../lib/labels';
import {
  addOpportunityAlert,
  addOpportunitySource,
  changeOpportunityStatus,
  removeOpportunityAlert,
  removeOpportunitySource,
  updateOpportunitySource,
  useAppState,
} from '../lib/store';
import { exportOpportunitiesCsv, exportOpportunitiesXlsx } from '../lib/exporters';
import { cn, formatEur, nowIso, uid } from '../lib/utils';
import { Button, Card, EmptyState, Input, Select, Tabs } from '../components/ui';
import OpportunityCard, { MatchBadge } from '../components/OpportunityCard';
import OpportunityDetail from '../components/OpportunityDetail';
import AddOpportunityDialog from '../components/AddOpportunityDialog';
import { useToast } from '../components/toast';

type View = 'search' | 'saved' | 'pipeline' | 'sources' | 'alerts';
type SortKey = 'match' | 'deadline' | 'published' | 'budget';

interface Filters {
  keyword: string;
  organization: string;
  country: string;
  topic: string;
  type: OpportunityType | 'all';
  status: OpportunityStatus | 'all';
  minScore: number;
  deadlineWindow: 'all' | 'open' | '7' | '15' | '30';
}

const EMPTY_FILTERS: Filters = {
  keyword: '',
  organization: '',
  country: '',
  topic: '',
  type: 'all',
  status: 'all',
  minScore: 0,
  deadlineWindow: 'all',
};

function applyFilters(list: Opportunity[], f: Filters): Opportunity[] {
  return list.filter((o) => {
    const text = `${o.title} ${o.organization} ${o.summary} ${o.topics.join(' ')}`.toLowerCase();
    if (f.keyword && !text.includes(f.keyword.toLowerCase())) return false;
    if (
      f.organization &&
      !`${o.organization} ${o.funder ?? ''}`.toLowerCase().includes(f.organization.toLowerCase())
    )
      return false;
    if (
      f.country &&
      !`${o.country} ${o.region ?? ''}`.toLowerCase().includes(f.country.toLowerCase())
    )
      return false;
    if (f.topic && !o.topics.join(' ').toLowerCase().includes(f.topic.toLowerCase())) return false;
    if (f.type !== 'all' && o.type !== f.type) return false;
    if (f.status !== 'all' && o.status !== f.status) return false;
    if (o.score < f.minScore) return false;
    if (f.deadlineWindow !== 'all') {
      const days = daysUntil(o.deadline);
      if (f.deadlineWindow === 'open') {
        if (days != null && days < 0) return false;
      } else {
        const limit = Number.parseInt(f.deadlineWindow, 10);
        if (days == null || days < 0 || days > limit) return false;
      }
    }
    return true;
  });
}

function sortList(list: Opportunity[], sort: SortKey): Opportunity[] {
  const sorted = [...list];
  switch (sort) {
    case 'match':
      return sorted.sort((a, b) => b.score - a.score);
    case 'deadline':
      return sorted.sort((a, b) => {
        const da = daysUntil(a.deadline);
        const db = daysUntil(b.deadline);
        const va = da == null || da < 0 ? Number.MAX_SAFE_INTEGER : da;
        const vb = db == null || db < 0 ? Number.MAX_SAFE_INTEGER : db;
        return va - vb;
      });
    case 'published':
      return sorted.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    case 'budget':
      return sorted.sort((a, b) => (b.budgetMaxEur ?? 0) - (a.budgetMaxEur ?? 0));
  }
}

function alertMatches(alert: OpportunityAlert, list: Opportunity[]): Opportunity[] {
  return list.filter((o) => {
    const c = alert.criteria;
    const text = `${o.title} ${o.organization} ${o.summary} ${o.topics.join(' ')}`.toLowerCase();
    if (c.keyword && !text.includes(c.keyword.toLowerCase())) return false;
    if (
      c.country &&
      !`${o.country} ${o.region ?? ''}`.toLowerCase().includes(c.country.toLowerCase())
    )
      return false;
    if (c.topic && !o.topics.join(' ').toLowerCase().includes(c.topic.toLowerCase())) return false;
    if (c.minScore != null && o.score < c.minScore) return false;
    return true;
  });
}

export default function Opportunities() {
  const state = useAppState();
  const { toast } = useToast();
  const [view, setView] = useState<View>('search');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>('match');
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<OpportunityStatus | null>(null);
  // Alerts form
  const [alertName, setAlertName] = useState('');
  const [alertKeyword, setAlertKeyword] = useState('');
  const [alertCountry, setAlertCountry] = useState('');
  const [alertMinScore, setAlertMinScore] = useState('');
  // Sources form
  const [srcName, setSrcName] = useState('');
  const [srcType, setSrcType] = useState('');
  const [srcUrl, setSrcUrl] = useState('');

  const all = state.opportunities;
  const filtered = useMemo(() => sortList(applyFilters(all, filters), sort), [all, filters, sort]);
  const savedList = useMemo(() => filtered.filter((o) => o.saved), [filtered]);
  const open = openId ? all.find((o) => o.id === openId) : undefined;

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const tabs = [
    { id: 'search' as View, label: 'Search', count: filtered.length },
    { id: 'saved' as View, label: 'Saved', count: all.filter((o) => o.saved).length },
    { id: 'pipeline' as View, label: 'Pipeline' },
    { id: 'sources' as View, label: 'Sources', count: state.opportunitySources.length },
    { id: 'alerts' as View, label: 'Alerts', count: state.opportunityAlerts.length },
  ];

  const renderFilters = (
    <Card className="mb-4 px-4 py-3">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Keyword…"
            value={filters.keyword}
            onChange={(e) => setFilter('keyword', e.target.value)}
            data-testid="opp-filter-keyword"
          />
        </div>
        <Input
          placeholder="Organization / funder…"
          value={filters.organization}
          onChange={(e) => setFilter('organization', e.target.value)}
          data-testid="opp-filter-organization"
        />
        <Input
          placeholder="Country / region…"
          value={filters.country}
          onChange={(e) => setFilter('country', e.target.value)}
          data-testid="opp-filter-country"
        />
        <Input
          placeholder="Topic…"
          value={filters.topic}
          onChange={(e) => setFilter('topic', e.target.value)}
        />
        <Select
          aria-label="Type"
          value={filters.type}
          onChange={(e) => setFilter('type', e.target.value as Filters['type'])}
        >
          <option value="all">All types</option>
          {(Object.keys(OPPORTUNITY_TYPE_LABELS) as OpportunityType[]).map((t) => (
            <option key={t} value={t}>
              {OPPORTUNITY_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Status"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value as Filters['status'])}
        >
          <option value="all">All statuses</option>
          {OPPORTUNITY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {OPPORTUNITY_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Deadline window"
          value={filters.deadlineWindow}
          onChange={(e) => setFilter('deadlineWindow', e.target.value as Filters['deadlineWindow'])}
        >
          <option value="all">Any deadline</option>
          <option value="open">Open only</option>
          <option value="7">Closes in ≤ 7 days</option>
          <option value="15">Closes in ≤ 15 days</option>
          <option value="30">Closes in ≤ 30 days</option>
        </Select>
        <div className="flex items-center gap-2">
          <Select
            aria-label="Minimum match score"
            value={String(filters.minScore)}
            onChange={(e) => setFilter('minScore', Number.parseInt(e.target.value, 10))}
            data-testid="opp-filter-minscore"
          >
            <option value="0">Any match</option>
            <option value="40">Match ≥ 40</option>
            <option value="60">Match ≥ 60</option>
            <option value="80">Match ≥ 80</option>
          </Select>
          <Select
            aria-label="Sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="match">Best match</option>
            <option value="deadline">Closest deadline</option>
            <option value="published">Most recent</option>
            <option value="budget">Largest budget</option>
          </Select>
        </div>
      </div>
    </Card>
  );

  const renderList = (list: Opportunity[]) =>
    list.length === 0 ? (
      <EmptyState
        title="No opportunities match"
        body="Adjust the filters or add an opportunity manually."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Analyze this opportunity
          </Button>
        }
      />
    ) : (
      <div className="space-y-2.5" data-testid="opportunity-list">
        {list.map((o) => (
          <OpportunityCard key={o.id} opportunity={o} onOpen={() => setOpenId(o.id)} />
        ))}
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tenders & Opportunities</h1>
          <p className="text-sm text-slate-500">
            Consulting opportunities for Impact Hydrogen — demo data, prototype analysis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportOpportunitiesCsv(filtered)}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportOpportunitiesXlsx(filtered)}
            data-testid="export-opportunities-xlsx"
          >
            <Download className="h-4 w-4" /> XLSX
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} data-testid="add-opportunity">
            <Plus className="h-4 w-4" /> Analyze this opportunity
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <Tabs tabs={tabs} value={view} onChange={setView} />
      </div>

      {(view === 'search' || view === 'saved') && (
        <>
          {renderFilters}
          {view === 'search' ? renderList(filtered) : renderList(savedList)}
        </>
      )}

      {view === 'pipeline' && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {OPPORTUNITY_STATUSES.map((status) => {
            const list = all.filter((o) => o.status === status).sort((a, b) => b.score - a.score);
            return (
              <div
                key={status}
                data-testid={`opp-column-${status}`}
                className={cn(
                  'flex w-64 shrink-0 flex-col rounded-xl border bg-slate-50/70',
                  dragOver === status ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200',
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(status);
                }}
                onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) {
                    changeOpportunityStatus(dragId, status);
                    toast(`Moved to ${OPPORTUNITY_STATUS_LABELS[status]}.`, 'success');
                  }
                  setDragId(null);
                  setDragOver(null);
                }}
              >
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {OPPORTUNITY_STATUS_LABELS[status]}
                  </span>
                  <span className="rounded-full bg-slate-200 px-1.5 text-xs text-slate-600">
                    {list.length}
                  </span>
                </div>
                <div className="flex-1 space-y-2 px-2 pb-2">
                  {list.map((o) => {
                    const days = daysUntil(o.deadline);
                    return (
                      <div
                        key={o.id}
                        draggable
                        data-testid={`opp-card-${o.id}`}
                        onDragStart={() => setDragId(o.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setDragOver(null);
                        }}
                        onClick={() => setOpenId(o.id)}
                        className={cn(
                          'cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-card active:cursor-grabbing',
                          dragId === o.id && 'opacity-50',
                        )}
                      >
                        <p className="text-xs font-medium leading-snug text-slate-800">{o.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {o.organization} · {o.budgetMaxEur ? formatEur(o.budgetMaxEur) : 'n/a'}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between text-[11px]">
                          <MatchBadge score={o.score} level={o.matchLevel} />
                        </div>
                        {days != null && days >= 0 && days < 7 && (
                          <p className="mt-1 text-[11px] font-semibold text-red-600">
                            ⚠ {days} day(s) left
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'sources' && (
        <div className="space-y-4">
          <Card className="px-4 py-3">
            <p className="mb-2 text-xs text-slate-500">
              Registry of portals the future MVP will crawl. Editable — nothing is fetched in the
              prototype.
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Input
                placeholder="Source name"
                value={srcName}
                onChange={(e) => setSrcName(e.target.value)}
                data-testid="source-name"
              />
              <Input
                placeholder="Organization type"
                value={srcType}
                onChange={(e) => setSrcType(e.target.value)}
              />
              <Input
                placeholder="https://…"
                value={srcUrl}
                onChange={(e) => setSrcUrl(e.target.value)}
                data-testid="source-url"
              />
              <Button
                size="md"
                disabled={srcName.trim() === ''}
                onClick={() => {
                  addOpportunitySource({
                    id: uid(),
                    name: srcName.trim(),
                    organizationType: srcType.trim() || 'Other',
                    url: srcUrl.trim(),
                    active: true,
                    isDemo: false,
                  });
                  setSrcName('');
                  setSrcType('');
                  setSrcUrl('');
                  toast('Source added.', 'success');
                }}
                data-testid="add-source"
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </Card>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">URL</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody data-testid="sources-table">
                {state.opportunitySources.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{s.name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{s.organizationType}</td>
                    <td className="px-4 py-2.5">
                      {s.url ? (
                        <a
                          className="text-brand-600 hover:underline"
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {s.url.replace(/^https?:\/\//, '')}
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Toggle ${s.name}`}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600"
                        checked={s.active}
                        onChange={(e) =>
                          updateOpportunitySource(s.id, { active: e.target.checked })
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${s.name}`}
                        onClick={() => {
                          removeOpportunitySource(s.id);
                          toast('Source removed.', 'info');
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'alerts' && (
        <div className="space-y-4">
          <Card className="px-4 py-3">
            <p className="mb-2 text-xs text-slate-500">
              Saved searches, evaluated locally against the current list. Email delivery and
              automatic crawling arrive with the MVP.
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_120px_auto]">
              <Input
                placeholder="Alert name"
                value={alertName}
                onChange={(e) => setAlertName(e.target.value)}
                data-testid="alert-name"
              />
              <Input
                placeholder="Keyword (e.g. hydrogen)"
                value={alertKeyword}
                onChange={(e) => setAlertKeyword(e.target.value)}
                data-testid="alert-keyword"
              />
              <Input
                placeholder="Country / region"
                value={alertCountry}
                onChange={(e) => setAlertCountry(e.target.value)}
              />
              <Input
                placeholder="Min score"
                type="number"
                value={alertMinScore}
                onChange={(e) => setAlertMinScore(e.target.value)}
              />
              <Button
                disabled={alertName.trim() === ''}
                onClick={() => {
                  addOpportunityAlert({
                    id: uid(),
                    name: alertName.trim(),
                    criteria: {
                      keyword: alertKeyword.trim() || undefined,
                      country: alertCountry.trim() || undefined,
                      minScore: Number.parseInt(alertMinScore, 10) || undefined,
                    },
                    createdAt: nowIso(),
                  });
                  setAlertName('');
                  setAlertKeyword('');
                  setAlertCountry('');
                  setAlertMinScore('');
                  toast('Alert created.', 'success');
                }}
                data-testid="add-alert"
              >
                <Bell className="h-4 w-4" /> Create
              </Button>
            </div>
          </Card>
          {state.opportunityAlerts.length === 0 ? (
            <EmptyState
              title="No alerts yet"
              body="Create a saved search to track what matters — e.g. hydrogen opportunities in Latin America with match ≥ 60."
            />
          ) : (
            <div className="space-y-2" data-testid="alerts-list">
              {state.opportunityAlerts.map((a) => {
                const matches = alertMatches(a, all);
                return (
                  <Card key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{a.name}</p>
                      <p className="text-xs text-slate-400">
                        {[
                          a.criteria.keyword && `keyword: ${a.criteria.keyword}`,
                          a.criteria.country && `country: ${a.criteria.country}`,
                          a.criteria.minScore != null && `match ≥ ${a.criteria.minScore}`,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'No criteria (matches everything)'}
                      </p>
                    </div>
                    <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                      {matches.length} match{matches.length === 1 ? '' : 'es'}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setView('search');
                        setFilters({
                          ...EMPTY_FILTERS,
                          keyword: a.criteria.keyword ?? '',
                          country: a.criteria.country ?? '',
                          minScore: a.criteria.minScore ?? 0,
                        });
                      }}
                    >
                      View matches
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete alert ${a.name}`}
                      onClick={() => removeOpportunityAlert(a.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                    </Button>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {open && <OpportunityDetail opportunity={open} onClose={() => setOpenId(null)} />}
      <AddOpportunityDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(id) => {
          setView('search');
          setFilters(EMPTY_FILTERS);
          setOpenId(id);
        }}
      />
    </div>
  );
}
