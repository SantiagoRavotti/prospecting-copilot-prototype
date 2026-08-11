// List row/card for an opportunity, with deadline color alerts and match badge.

import { Bookmark, ExternalLink } from 'lucide-react';
import type { MatchLevel, Opportunity } from '../lib/opportunityTypes';
import { OPPORTUNITY_TYPE_LABELS } from '../lib/opportunityTypes';
import { MATCH_LEVEL_LABELS, daysUntil, deadlineTone } from '../lib/opportunityScoring';
import { OPPORTUNITY_STATUS_COLORS, OPPORTUNITY_STATUS_LABELS } from '../lib/labels';
import { toggleOpportunitySaved } from '../lib/store';
import { cn, formatDate, formatEur } from '../lib/utils';
import { Badge, Button, Card } from './ui';
import { useToast } from './toast';

export function MatchBadge({ score, level }: { score: number; level: MatchLevel }) {
  const color =
    level === 'high'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : level === 'review'
        ? 'bg-blue-50 text-blue-700 border-blue-200'
        : level === 'possible_with_partners'
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <Badge className={color}>
      Match {score}% · {MATCH_LEVEL_LABELS[level]}
    </Badge>
  );
}

export function DeadlineBadge({ deadline }: { deadline?: string }) {
  const tone = deadlineTone(deadline);
  const days = daysUntil(deadline);
  if (tone === 'none')
    return <Badge className="border-slate-200 bg-slate-50 text-slate-500">No deadline</Badge>;
  const styles = {
    closed: 'bg-gray-100 text-gray-500 border-gray-200',
    red: 'bg-red-50 text-red-700 border-red-300',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  } as const;
  const label =
    tone === 'closed'
      ? 'Closed'
      : days === 0
        ? 'Closes today'
        : `${days} day${days === 1 ? '' : 's'} left`;
  return (
    <Badge className={styles[tone]}>
      {formatDate(deadline)} · {label}
    </Badge>
  );
}

export default function OpportunityCard({
  opportunity,
  onOpen,
}: {
  opportunity: Opportunity;
  onOpen: () => void;
}) {
  const o = opportunity;
  const { toast } = useToast();
  return (
    <Card
      className={cn('px-4 py-3.5', o.matchLevel === 'high' && 'border-l-4 border-l-emerald-400')}
      data-testid="opportunity-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <button className="text-left" onClick={onOpen}>
            <h3 className="text-sm font-semibold leading-snug text-slate-900 hover:text-brand-700">
              {o.title}
            </h3>
          </button>
          <p className="mt-0.5 text-xs text-slate-500">
            {o.organization}
            {o.funder ? ` · funded by ${o.funder}` : ''} · {o.country}
            {o.region ? ` (${o.region})` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <MatchBadge score={o.score} level={o.matchLevel} />
            <DeadlineBadge deadline={o.deadline} />
            <Badge className="border-slate-200 bg-slate-50 text-slate-600">
              {OPPORTUNITY_TYPE_LABELS[o.type]}
            </Badge>
            <Badge className={OPPORTUNITY_STATUS_COLORS[o.status]}>
              {OPPORTUNITY_STATUS_LABELS[o.status]}
            </Badge>
            {o.topics.slice(0, 2).map((t) => (
              <Badge key={t} className="border-slate-200 bg-white text-slate-500">
                {t}
              </Badge>
            ))}
            {o.isDemo && (
              <Badge className="border-dashed border-slate-300 bg-slate-50 text-slate-400">
                Demo — fictional
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <p className="text-sm font-semibold text-slate-800">
            {o.budgetMaxEur ? formatEur(o.budgetMaxEur) : 'Budget n/a'}
          </p>
          <div className="flex gap-1">
            <Button
              variant={o.saved ? 'secondary' : 'ghost'}
              size="sm"
              aria-label={o.saved ? 'Remove from saved' : 'Save opportunity'}
              onClick={() => {
                toggleOpportunitySaved(o.id);
                toast(o.saved ? 'Removed from saved.' : 'Opportunity saved.', 'success');
              }}
              data-testid="save-opportunity"
            >
              <Bookmark className={cn('h-3.5 w-3.5', o.saved && 'fill-current')} />
            </Button>
            {o.url && (
              <a
                href={o.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open original source"
              >
                <Button variant="ghost" size="sm">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
            )}
            <Button variant="outline" size="sm" onClick={onOpen} data-testid="open-opportunity">
              Open
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
