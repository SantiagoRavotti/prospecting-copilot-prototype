// Display metadata for statuses, priorities and confidence levels.

import type { Priority, ProspectStatus, ResearchConfidence } from './types';
import type { OpportunityStatus } from './opportunityTypes';

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  new: 'New',
  review: 'Review',
  go: 'Go',
  partner_search: 'Partner search',
  preparing_bid: 'Preparing bid',
  submitted: 'Submitted',
  won: 'Won',
  lost: 'Lost',
  discarded: 'Discarded',
};

export const OPPORTUNITY_STATUS_COLORS: Record<OpportunityStatus, string> = {
  new: 'bg-slate-100 text-slate-700 border-slate-200',
  review: 'bg-blue-50 text-blue-700 border-blue-200',
  go: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partner_search: 'bg-amber-50 text-amber-700 border-amber-200',
  preparing_bid: 'bg-violet-50 text-violet-700 border-violet-200',
  submitted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  won: 'bg-green-50 text-green-800 border-green-300',
  lost: 'bg-rose-50 text-rose-700 border-rose-200',
  discarded: 'bg-gray-100 text-gray-500 border-gray-200',
};

export const STATUS_LABELS: Record<ProspectStatus, string> = {
  new: 'New',
  ready_for_review: 'Ready for review',
  saved_for_later: 'Saved for later',
  connection_sent: 'Connection sent',
  connection_accepted: 'Connection accepted',
  replied: 'Replied',
  follow_up_required: 'Follow-up required',
  meeting_proposed: 'Meeting proposed',
  meeting_booked: 'Meeting booked',
  opportunity: 'Opportunity',
  not_interested: 'Not interested',
  do_not_contact: 'Do not contact',
  archived: 'Archived',
};

export const STATUS_COLORS: Record<ProspectStatus, string> = {
  new: 'bg-slate-100 text-slate-700 border-slate-200',
  ready_for_review: 'bg-blue-50 text-blue-700 border-blue-200',
  saved_for_later: 'bg-amber-50 text-amber-700 border-amber-200',
  connection_sent: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  connection_accepted: 'bg-teal-50 text-teal-700 border-teal-200',
  replied: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  follow_up_required: 'bg-orange-50 text-orange-700 border-orange-200',
  meeting_proposed: 'bg-violet-50 text-violet-700 border-violet-200',
  meeting_booked: 'bg-purple-50 text-purple-700 border-purple-200',
  opportunity: 'bg-green-50 text-green-800 border-green-300',
  not_interested: 'bg-rose-50 text-rose-700 border-rose-200',
  do_not_contact: 'bg-red-50 text-red-800 border-red-300',
  archived: 'bg-gray-100 text-gray-500 border-gray-200',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  hot: 'Hot',
  strong_fit: 'Strong fit',
  networking: 'Networking',
  low_confidence: 'Low confidence',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  hot: 'bg-red-50 text-red-700 border-red-200',
  strong_fit: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  networking: 'bg-blue-50 text-blue-700 border-blue-200',
  low_confidence: 'bg-gray-100 text-gray-600 border-gray-200',
};

export const CONFIDENCE_LABELS: Record<ResearchConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

export const CONFIDENCE_COLORS: Record<ResearchConfidence, string> = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-rose-50 text-rose-700 border-rose-200',
};
