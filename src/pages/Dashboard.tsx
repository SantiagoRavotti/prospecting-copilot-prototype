import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  CalendarClock,
  CheckCircle2,
  Handshake,
  Inbox,
  MessageCircle,
  Send,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { activeWorkspace, useAppState, workspaceProspects } from '../lib/store';
import { isPast, isToday } from '../lib/utils';
import { Card } from '../components/ui';

function Kpi({
  label,
  value,
  icon: Icon,
  to,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
}) {
  const body = (
    <Card className="flex items-center gap-3 px-4 py-3.5 transition-shadow hover:shadow-pop">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight text-slate-900">{value}</p>
        <p className="truncate text-xs text-slate-500">{label}</p>
      </div>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function Dashboard() {
  const state = useAppState();
  const workspace = activeWorkspace(state);
  const prospects = workspaceProspects(state);

  const kpis = useMemo(() => {
    const newToday = prospects.filter((p) => isToday(p.createdAt)).length;
    const ready = prospects.filter((p) => p.status === 'ready_for_review').length;
    const sent = prospects.filter((p) => p.sentAt != null).length;
    const saved = prospects.filter((p) => p.status === 'saved_for_later').length;
    const prospectIds = new Set(prospects.map((p) => p.id));
    const followUpsDue = state.followUps.filter(
      (f) => f.status === 'pending' && prospectIds.has(f.prospectId) && isPast(f.dueAt),
    ).length;
    const accepted = prospects.filter((p) =>
      [
        'connection_accepted',
        'replied',
        'follow_up_required',
        'meeting_proposed',
        'meeting_booked',
        'opportunity',
      ].includes(p.status),
    ).length;
    const replies = prospects.filter((p) =>
      ['replied', 'meeting_proposed', 'meeting_booked', 'opportunity'].includes(p.status),
    ).length;
    const meetings = prospects.filter((p) =>
      ['meeting_proposed', 'meeting_booked'].includes(p.status),
    ).length;
    const opportunities = prospects.filter((p) => p.status === 'opportunity').length;
    const avgScore =
      prospects.length === 0
        ? 0
        : Math.round(prospects.reduce((sum, p) => sum + p.score, 0) / prospects.length);
    return {
      newToday,
      ready,
      sent,
      saved,
      followUpsDue,
      accepted,
      replies,
      meetings,
      opportunities,
      avgScore,
    };
  }, [prospects, state.followUps]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-600">
          Prototype data — local demo analytics
        </span>
      </div>
      <p className="mb-5 text-sm text-slate-500">{workspace.name}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="New prospects today" value={kpis.newToday} icon={Sparkles} to="/today" />
        <Kpi label="Ready for review" value={kpis.ready} icon={Inbox} to="/today" />
        <Kpi label="Requests marked sent" value={kpis.sent} icon={Send} to="/pipeline" />
        <Kpi label="Saved prospects" value={kpis.saved} icon={Bookmark} to="/pipeline" />
        <Kpi
          label="Follow-ups due"
          value={kpis.followUpsDue}
          icon={CalendarClock}
          to="/follow-ups"
        />
        <Kpi
          label="Connections accepted"
          value={kpis.accepted}
          icon={CheckCircle2}
          to="/pipeline"
        />
        <Kpi label="Replies" value={kpis.replies} icon={MessageCircle} to="/pipeline" />
        <Kpi label="Meetings" value={kpis.meetings} icon={Handshake} to="/pipeline" />
        <Kpi label="Opportunities" value={kpis.opportunities} icon={Target} to="/pipeline" />
        <Kpi label="Average lead score" value={kpis.avgScore} icon={TrendingUp} to="/analytics" />
      </div>

      <Card className="mt-6 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">How this prototype works</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">
          <li>
            All prospects are <strong>fictional demo data</strong>, manual entries, or CSV imports —
            no web research or AI calls occur.
          </li>
          <li>
            Messages come from a local template engine and are labeled as prototype-generated.
          </li>
          <li>Everything you change is stored in this browser's local storage only.</li>
          <li>
            The daily workflow: review each prospect in{' '}
            <Link className="text-brand-600 hover:underline" to="/today">
              Today's Prospects
            </Link>
            , edit the message, copy it, open LinkedIn, send manually, and mark it as sent.
          </li>
        </ul>
      </Card>
    </div>
  );
}
