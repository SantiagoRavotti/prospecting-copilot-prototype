# Auth config backup — 2026-10-21 (before enabling the OAuth 2.1 server)

Values read from the project with `supabase config diff` / `config pull` right before the change:

| Setting | Before | After |
| --- | --- | --- |
| OAuth server enabled | false | true |
| Dynamic client registration | not set | true |
| Authorization path | not set | /oauth/consent |
| Magic-link email subject | "Your sign-in link" | "Tu código de acceso a Prospecting Copilot" |
| Magic-link email body | not readable through the CLI | supabase/templates/magic_link.html (code + link) |

Untouched (confirmed by the diff): site URL, redirect URLs, OTP length (8), email confirmations,
MFA, pooler, storage. Full pulled snapshot: `remote-config-pulled.toml`.

## Revert

From this folder: `npx supabase config push --project-ref vqyhxjjirskadwomfjkp`.
That disables the OAuth server and restores the subject. The previous email body could not be
read, so the revert sets Supabase's default magic-link body; it only contains the sign-in link.
OAuth clients that ChatGPT registered stay listed under Authentication → OAuth Apps until deleted.
