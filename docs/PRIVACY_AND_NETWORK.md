# Privacy and network behavior

Moirai Cut is local-first, not offline-only. The editor can work with local media
without an account, while optional integrations may contact services selected
by the user or deployment operator. This table documents the current repository
defaults.

| Surface | Default destination | When data is sent | Typical data | Default |
| --- | --- | --- | --- | --- |
| Project editing | Local browser storage and configured project directory | Import, edit, save, proxy and export | Media, project JSON, caches and exports | Local only |
| Moirai Cut MCP | Local stdio process and loopback editor presence API | Agent App reads or edits a project | Project summary, selected context, tool arguments and results | Opt-in install |
| Shared Codex host | `ws://127.0.0.1:48721` | Browser and Codex App share a task | Conversation events, project references and tool events | Loopback only |
| Codex / Claude | Provider selected by the user | User sends an Agent message | Prompt, selected project context and, in multimodal modes, sampled frames | User initiated |
| Marble CMS | `NEXT_PUBLIC_MARBLE_API_URL` | Only after an operator explicitly configures `MARBLE_WORKSPACE_KEY` | Public content queries | Disabled |
| Freesound | Freesound API | User searches or imports external audio | Search query and provider credentials | User initiated |
| Databuddy | `https://cdn.databuddy.cc` and the configured project | Operator sets `NEXT_PUBLIC_DATABUDDY_CLIENT_ID` | Error events under the options in `app/layout.tsx`; no session replay or attribute capture | Disabled |
| Database / Redis | Operator-configured services | Accounts or hosted features are enabled | Authentication and application state | Optional self-hosted |

## Local guarantees

- The default local setup does not require Moirai Cut account registration.
- `setup:local` binds editor integrations to loopback addresses.
- Final export reads original media even when preview proxies are enabled.
- Installing the MCP grants the selected Agent access to local project tools;
  it should not be exposed to an untrusted network without authentication.
- The repository contains no inherited Marble workspace key; clean builds do
  not fetch upstream blog content.
- Without Redis, rate limiting is process-local and suitable only for local
  single-instance use. Hosted operators must configure shared rate limiting.

## Operator responsibilities

Hosted operators must publish their actual privacy policy, name every enabled
third-party service, secure credentials, define retention and deletion rules,
and obtain any consent required in their jurisdiction. Repository defaults are
not a substitute for a deployment-specific disclosure.

## Reporting safely

Diagnostic logs can contain project names, local paths, model providers and
task content. Remove private paths, credentials, prompts and media before
posting logs or screenshots to a public issue. Report suspected credential or
media exposure privately according to [`.github/SECURITY.md`](../.github/SECURITY.md).
