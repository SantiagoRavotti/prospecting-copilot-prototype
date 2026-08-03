import { Flame, ShieldQuestion, Sparkles, Users } from 'lucide-react';
import type { Priority, ProspectStatus, ResearchConfidence } from '../lib/types';
import {
  CONFIDENCE_COLORS,
  CONFIDENCE_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from '../lib/labels';
import { cn } from '../lib/utils';
import { Badge } from './ui';

const PRIORITY_ICONS: Record<Priority, React.ReactNode> = {
  hot: <Flame className="h-3 w-3" />,
  strong_fit: <Sparkles className="h-3 w-3" />,
  networking: <Users className="h-3 w-3" />,
  low_confidence: <ShieldQuestion className="h-3 w-3" />,
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge className={PRIORITY_COLORS[priority]}>
      {PRIORITY_ICONS[priority]}
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: ProspectStatus }) {
  return <Badge className={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function ConfidenceBadge({ confidence }: { confidence: ResearchConfidence }) {
  return <Badge className={CONFIDENCE_COLORS[confidence]}>{CONFIDENCE_LABELS[confidence]}</Badge>;
}

export function DemoBadge() {
  return (
    <Badge className="border-dashed border-slate-300 bg-slate-50 text-slate-500">
      Demo prospect — fictional data
    </Badge>
  );
}

export function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color =
    score >= 80
      ? 'text-emerald-500'
      : score >= 60
        ? 'text-brand-500'
        : score >= 40
          ? 'text-amber-500'
          : 'text-slate-400';
  return (
    <div
      className="relative inline-flex items-center justify-center"
      title={`Demo score: ${score}/100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={4}
          className="stroke-slate-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          className={cn('stroke-current transition-all', color)}
        />
      </svg>
      <span className="absolute text-xs font-bold text-slate-800">{score}</span>
    </div>
  );
}
