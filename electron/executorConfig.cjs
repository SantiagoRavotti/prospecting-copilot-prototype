// Browser executor (Claude via an authorized subscription session, e.g. the
// Claude Code CLI). Mirrors src/lib/executor.ts.
//
// Rule: run ONLY with the user's chosen model. If the authorized account
// reports it unavailable, stop and report — never substitute Haiku, Sonnet 5
// or any other model silently.

module.exports = {
  MODEL_ID: 'claude-sonnet-5-5',
  MODEL_NAME: 'Claude Sonnet 5.5',
  ALLOW_FALLBACK: false,
  // No account is authorized yet (the Team account is explicitly NOT).
  AUTHORIZED_ACCOUNT: null,
};
