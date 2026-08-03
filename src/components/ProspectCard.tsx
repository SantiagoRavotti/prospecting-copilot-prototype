// The primary product surface: the large prospect-review card.

import { useState } from 'react';
import {
  Archive,
  Bookmark,
  Building2,
  CalendarPlus,
  ChevronDown,
  ExternalLink,
  Globe,
  MapPin,
  Send,
  SkipForward,
  StickyNote,
} from 'lucide-react';
import type { Company, Person, Prospect, Workspace } from '../lib/types';
import { addNote, changeStatus, markSent, skipProspect } from '../lib/store';
import { cn, daysFromNow, formatDateTime } from '../lib/utils';
import { Button, Card, Dialog, Input, Kbd, Textarea } from './ui';
import { ConfidenceBadge, DemoBadge, PriorityBadge, ScoreRing, StatusBadge } from './badges';
import MessageEditor from './MessageEditor';
import { useToast } from './toast';
import { createFollowUp } from '../lib/store';

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-slate-100">
      <button
        className="flex w-full items-center justify-between px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {title}
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value}</dd>
    </div>
  );
}

export default function ProspectCard({
  prospect,
  person,
  company,
  workspace,
  onAdvance,
}: {
  prospect: Prospect;
  person: Person;
  company: Company;
  workspace: Workspace;
  onAdvance: () => void;
}) {
  const { toast } = useToast();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(prospect.notes);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDays, setFollowUpDays] = useState('7');
  const [followUpMsg, setFollowUpMsg] = useState('Check whether the connection was accepted.');

  const openLinkedIn = () => {
    window.open(person.linkedinUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSent = () => {
    markSent(prospect.id);
    toast(`${person.fullName} marked as sent.`, 'success');
    onAdvance();
  };

  const handleSkip = () => {
    skipProspect(prospect.id);
    toast(`${person.fullName} skipped.`, 'info');
    onAdvance();
  };

  const handleLater = () => {
    changeStatus(prospect.id, 'saved_for_later', 'Saved for later during review.');
    toast(`${person.fullName} saved for later.`, 'info');
    onAdvance();
  };

  const handleArchive = () => {
    changeStatus(prospect.id, 'archived', 'Archived during review.');
    toast(`${person.fullName} archived.`, 'info');
    onAdvance();
  };

  return (
    <Card className="overflow-hidden" data-testid="prospect-card">
      {/* Header: essentials visible in <30 seconds */}
      <div className="px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-900" data-testid="prospect-name">
                {person.fullName}
              </h2>
              <PriorityBadge priority={prospect.priority} />
              <StatusBadge status={prospect.status} />
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {person.title} · <span className="font-medium">{company.name}</span>
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
              <MapPin className="h-3 w-3" />
              {person.city}, {person.country} · {person.functionalArea} · {person.seniority}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ConfidenceBadge confidence={person.researchConfidence} />
              {prospect.isDemo && <DemoBadge />}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <ScoreRing score={prospect.score} size={56} />
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Demo score</span>
          </div>
        </div>

        {/* Why this person / why now */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-brand-50/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
              Why this person
            </p>
            <p className="mt-1 text-sm leading-snug text-slate-700">{prospect.fitReason}</p>
          </div>
          <div className="rounded-lg bg-amber-50/70 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Why now
            </p>
            <p className="mt-1 text-sm leading-snug text-slate-700">{prospect.timingReason}</p>
          </div>
        </div>
      </div>

      {/* Message */}
      <div className="border-t border-slate-100 px-5 py-4">
        <MessageEditor prospect={prospect} />
      </div>

      {/* Primary actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
        <Button variant="outline" size="md" onClick={openLinkedIn} data-testid="open-linkedin">
          <ExternalLink className="h-4 w-4" /> Open LinkedIn <Kbd>O</Kbd>
        </Button>
        <Button variant="primary" size="md" onClick={handleSent} data-testid="mark-sent">
          <Send className="h-4 w-4" /> Mark as sent <Kbd>S</Kbd>
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={handleSkip} data-testid="skip-prospect">
          <SkipForward className="h-3.5 w-3.5" /> Skip <Kbd>K</Kbd>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleLater} data-testid="save-later">
          <Bookmark className="h-3.5 w-3.5" /> Later <Kbd>L</Kbd>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleArchive} data-testid="archive-prospect">
          <Archive className="h-3.5 w-3.5" /> Archive
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setNoteOpen(true)}>
          <StickyNote className="h-3.5 w-3.5" /> Note
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setFollowUpOpen(true)}>
          <CalendarPlus className="h-3.5 w-3.5" /> Follow-up
        </Button>
      </div>

      {/* Progressive disclosure */}
      <Section title="Prospecting analysis" defaultOpen>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Detail label="Recommended outreach angle" value={prospect.outreachAngle} />
          <Detail label="Recommended service" value={prospect.recommendedService} />
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Score breakdown (demo score)
            </dt>
            <dd className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ['Relevance', prospect.scoreBreakdown.relevance, 40],
                  ['Seniority', prospect.scoreBreakdown.seniority, 25],
                  ['Timing', prospect.scoreBreakdown.timing, 20],
                  ['Geography', prospect.scoreBreakdown.geography, 15],
                ] as const
              ).map(([label, value, max]) => (
                <div key={label} className="rounded-lg border border-slate-200 p-2 text-center">
                  <p className="text-sm font-semibold text-slate-800">
                    {value}
                    <span className="text-xs font-normal text-slate-400">/{max}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">{label}</p>
                </div>
              ))}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Person details">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Detail label="Professional summary" value={person.professionalSummary} />
          </div>
          <div className="sm:col-span-2">
            <Detail label="Career history" value={person.careerSummary} />
          </div>
          <Detail
            label="LinkedIn"
            value={
              <a
                className="break-all text-brand-600 hover:underline"
                href={person.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {person.linkedinUrl}
              </a>
            }
          />
          <Detail
            label="Sources"
            value={
              <ul className="list-inside list-disc text-xs text-slate-500">
                {person.sourceReferences.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            }
          />
        </dl>
      </Section>

      <Section title="Company details">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-800">
          <Building2 className="h-4 w-4 text-slate-400" />
          {company.name}
          <a
            href={company.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-normal text-brand-600 hover:underline"
          >
            <Globe className="h-3 w-3" /> website
          </a>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Detail label="Industry" value={company.industry} />
          <Detail label="Type" value={company.type} />
          <Detail label="Country" value={`${company.city}, ${company.country}`} />
          <Detail label="Approx. size" value={`${company.size} employees`} />
          <div className="sm:col-span-2">
            <Detail label="Description" value={company.description} />
          </div>
          <Detail
            label="Relevant initiatives"
            value={
              company.relevantInitiatives.length > 0 ? (
                <ul className="list-inside list-disc">
                  {company.relevantInitiatives.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              ) : null
            }
          />
          <Detail label="Commercial trigger" value={company.commercialTrigger} />
          <div className="sm:col-span-2">
            <Detail
              label={`Why they might need ${workspace.senderCompany}`}
              value={prospect.fitReason}
            />
          </div>
        </dl>
      </Section>

      {(prospect.notes || prospect.sentAt || prospect.editedAt) && (
        <div className="flex flex-wrap gap-4 border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">
          {prospect.notes && <span>Note: {prospect.notes}</span>}
          {prospect.editedAt && <span>Edited {formatDateTime(prospect.editedAt)}</span>}
          {prospect.sentAt && <span>Sent {formatDateTime(prospect.sentAt)}</span>}
        </div>
      )}

      {/* Note dialog */}
      <Dialog open={noteOpen} onClose={() => setNoteOpen(false)} title="Prospect note">
        <Textarea
          rows={4}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Context, reminders, next steps…"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setNoteOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              addNote(prospect.id, noteText);
              setNoteOpen(false);
              toast('Note saved.', 'success');
            }}
          >
            Save note
          </Button>
        </div>
      </Dialog>

      {/* Follow-up dialog */}
      <Dialog open={followUpOpen} onClose={() => setFollowUpOpen(false)} title="Create follow-up">
        <div className="space-y-3">
          <label className="block text-sm text-slate-600">
            Due in (days)
            <Input
              type="number"
              min={0}
              className="mt-1"
              value={followUpDays}
              onChange={(e) => setFollowUpDays(e.target.value)}
            />
          </label>
          <label className="block text-sm text-slate-600">
            Reminder
            <Textarea
              rows={3}
              className="mt-1"
              value={followUpMsg}
              onChange={(e) => setFollowUpMsg(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setFollowUpOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              createFollowUp(
                prospect.id,
                daysFromNow(Number.parseInt(followUpDays, 10) || 0),
                followUpMsg,
              );
              setFollowUpOpen(false);
              toast('Follow-up created.', 'success');
            }}
          >
            Create follow-up
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
