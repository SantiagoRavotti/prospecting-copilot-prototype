// Pure builder of the read snapshot the desktop app publishes for ChatGPT.
// Shape must match `Snapshot` in supabase/functions/crm-mcp/core.ts.
// Only what the read tools need: campaigns, research tasks, sender identity,
// contacted people (for dedupe), conversations and follow-ups.

function buildSnapshot(state) {
  const people = (state.people || []);
  const companies = (state.companies || []);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    workspaces: (state.workspaces || []).map((w) => ({
      id: w.id,
      name: w.name,
      sender: {
        name: w.senderName,
        title: w.senderTitle,
        company: w.senderCompany,
        bio: w.senderBio,
        valueProposition: w.valueProposition,
        services: w.services,
      },
    })),
    campaigns: state.campaigns || [],
    researchTasks: state.researchTasks || [],
    people: (state.prospects || []).map((p) => {
      const person = people.find((x) => x.id === p.personId);
      return {
        prospect_id: p.id,
        name: person && person.fullName,
        title: person && person.title,
        company: (companies.find((c) => c.id === p.companyId) || {}).name,
        linkedin_url: person && person.linkedinUrl,
        status: p.status,
        approval: p.approval && p.approval.status,
        campaign_id: p.campaignId,
        final_message: p.editedMessage != null ? p.editedMessage : p.originalDraft,
      };
    }),
    conversations: (state.conversations || []).slice(-300),
    followUps: (state.followUps || []).map((f) => ({
      id: f.id,
      prospectId: f.prospectId,
      dueDate: f.dueDate,
      type: f.type,
      status: f.status,
      notes: f.notes,
    })),
  };
}

module.exports = { buildSnapshot };
