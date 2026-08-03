// Prototype analytics computed locally from prospect state and activities.
// Rates are hidden when the sample is too small to be meaningful.

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppState, workspaceProspects, activeWorkspace } from '../lib/store';
import { MESSAGE_PATTERNS } from '../lib/templates';
import { personById } from '../lib/store';
import { percent } from '../lib/utils';
import { Card, CardHeader } from '../components/ui';

const MIN_SAMPLE = 5;

const ACCEPTED = [
  'connection_accepted',
  'replied',
  'follow_up_required',
  'meeting_proposed',
  'meeting_booked',
  'opportunity',
];
const REPLIED = ['replied', 'meeting_proposed', 'meeting_booked', 'opportunity'];
const MEETING = ['meeting_proposed', 'meeting_booked', 'opportunity'];

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 px-3 py-2.5">
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

function BreakdownChart({
  data,
  title,
}: {
  data: { name: string; sent: number; replies: number }[];
  title: string;
}) {
  const filtered = data.filter((d) => d.sent > 0).slice(0, 8);
  return (
    <Card>
      <CardHeader
        title={title}
        subtitle="Prototype data — counts of requests marked sent / replies"
      />
      <div className="h-56 px-4 py-3">
        {filtered.length === 0 ? (
          <p className="pt-16 text-center text-sm text-slate-400">Not enough data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filtered} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                interval={0}
                angle={-18}
                textAnchor="end"
                height={44}
              />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="sent" name="Sent" fill="#59a2ff" radius={[3, 3, 0, 0]} />
              <Bar dataKey="replies" name="Replies" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

export default function Analytics() {
  const state = useAppState();
  const workspace = activeWorkspace(state);
  const prospects = workspaceProspects(state);

  const stats = useMemo(() => {
    const reviewed = prospects.filter((p) => p.reviewedAt != null).length;
    const edited = prospects.filter((p) => p.editedAt != null || p.editedMessage != null).length;
    const sent = prospects.filter((p) => p.sentAt != null);
    const accepted = sent.filter((p) => ACCEPTED.includes(p.status)).length;
    const replied = sent.filter((p) => REPLIED.includes(p.status)).length;
    const meetings = prospects.filter((p) => MEETING.includes(p.status)).length;
    return { reviewed, edited, sent: sent.length, accepted, replied, meetings };
  }, [prospects]);

  const grouped = useMemo(() => {
    const groupBy = (keyFn: (p: (typeof prospects)[number]) => string) => {
      const map = new Map<string, { sent: number; replies: number }>();
      for (const p of prospects) {
        if (p.sentAt == null) continue;
        const key = keyFn(p) || 'Unknown';
        const entry = map.get(key) ?? { sent: 0, replies: 0 };
        entry.sent += 1;
        if (REPLIED.includes(p.status)) entry.replies += 1;
        map.set(key, entry);
      }
      return [...map.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.sent - a.sent);
    };
    return {
      byCountry: groupBy((p) => personById(state, p.personId)?.country ?? ''),
      byIndustry: groupBy((p) => state.companies.find((c) => c.id === p.companyId)?.industry ?? ''),
      byFunction: groupBy((p) => personById(state, p.personId)?.functionalArea ?? ''),
      byPattern: groupBy(
        (p) => MESSAGE_PATTERNS.find((m) => m.id === p.patternId)?.name ?? p.patternId,
      ),
      byWorkspace: (() => {
        const map = new Map<string, { sent: number; replies: number }>();
        for (const p of state.prospects) {
          if (p.sentAt == null) continue;
          const name = state.workspaces.find((w) => w.id === p.workspaceId)?.name ?? 'Unknown';
          const entry = map.get(name) ?? { sent: 0, replies: 0 };
          entry.sent += 1;
          if (REPLIED.includes(p.status)) entry.replies += 1;
          map.set(name, entry);
        }
        return [...map.entries()].map(([name, v]) => ({ name, ...v }));
      })(),
    };
  }, [prospects, state]);

  const enoughForRates = stats.sent >= MIN_SAMPLE;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Analytics</h1>
        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-600">
          Prototype data — locally generated
        </span>
      </div>
      <p className="mb-5 text-sm text-slate-500">{workspace.name}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Prospects reviewed" value={stats.reviewed} />
        <Stat label="Messages edited" value={stats.edited} />
        <Stat label="Requests marked sent" value={stats.sent} />
        <Stat
          label="Acceptance rate"
          value={enoughForRates ? percent(stats.accepted, stats.sent) : '—'}
          hint={enoughForRates ? undefined : `Needs ≥${MIN_SAMPLE} sent`}
        />
        <Stat
          label="Reply rate"
          value={enoughForRates ? percent(stats.replied, stats.sent) : '—'}
          hint={enoughForRates ? undefined : `Needs ≥${MIN_SAMPLE} sent`}
        />
        <Stat label="Meetings" value={stats.meetings} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <BreakdownChart title="Performance by workspace" data={grouped.byWorkspace} />
        <BreakdownChart title="Performance by country" data={grouped.byCountry} />
        <BreakdownChart title="Performance by industry" data={grouped.byIndustry} />
        <BreakdownChart title="Performance by job function" data={grouped.byFunction} />
        <BreakdownChart title="Performance by message pattern" data={grouped.byPattern} />
      </div>

      <p className="mt-4 text-xs text-slate-400">
        All analytics are prototype data derived from local actions and fictional demo prospects.
        Rates are hidden until at least {MIN_SAMPLE} requests are marked sent.
      </p>
    </div>
  );
}
