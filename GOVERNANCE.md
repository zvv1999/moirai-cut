# Moirai Cut governance

Moirai Cut uses a maintainer-led, open-development model during the developer
preview. Decisions, code review and release evidence should remain visible in
GitHub issues and pull requests whenever security or private media does not
require a private channel.

## Roles

- **Contributors** propose issues, documentation, designs and pull requests.
- **Reviewers** provide reproducible technical review but cannot merge by role
  alone.
- **Maintainers** triage, approve, merge, revert, release and manage repository
  settings.
- **Security maintainers** handle private advisories and coordinated disclosure.

The bootstrap maintainer is `@zvv1999`, matching `CODEOWNERS`. Add at least one
independent backup maintainer before a stable release.

## Decision process

1. Bug fixes and small compatible changes use normal pull-request review.
2. Project-format, protocol, provider, privacy or architecture changes require
   an issue describing compatibility and rollback.
3. A maintainer records the decision in the issue or pull request. Silence is
   not approval.
4. Security response may be private until a coordinated fix is available.

Maintainers may merge low-risk changes after one approving review and green
required checks. Breaking changes, credential flows, project migrations and
new external data destinations require two maintainer approvals once a second
maintainer exists.

## Releases and support

Releases follow [RELEASING.md](RELEASING.md). The latest developer-preview
release is supported on a best-effort basis. A stable support window will not
be promised until the project publishes versioning and migration guarantees.

## Conduct and conflicts

Participation is governed by [the Code of Conduct](.github/CODE_OF_CONDUCT.md).
Maintainers must disclose material conflicts and should recuse themselves when
reviewing changes from an employer, paid client or product they control.

Governance changes use the same pull-request process and should include a
public rationale and transition date.
