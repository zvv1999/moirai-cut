# Moirai Cut open-source release checklist

This checklist separates what is already safe in the public developer-preview
branch from the external actions maintainers must complete before a default-
branch or tagged release. A checked item is supported by the current tree; it is
not a legal, security or platform guarantee.

## Release blockers

- [ ] Complete professional name, trademark, domain and social-handle clearance
      for **Moirai Cut** in target regions. Unrelated products already use the name;
      repository branding is not legal clearance.
- [ ] Decide the canonical GitHub organization and rename the repository; update
      clone URLs, package scopes, deployment URLs and social links in one release.
- [ ] Move the release branch to the default branch and require CI plus review
      before merge.
- [ ] Configure a project-owned domain through `NEXT_PUBLIC_SITE_URL`.
- [ ] Enable GitHub private vulnerability reporting, Discussions and branch
      protection.
- [ ] Confirm maintainers, security contacts, response expectations, release
      signing policy and governance ownership.
- [x] Run the complete quality gate from a fresh-history macOS snapshot and
      archive the local results; Windows and Linux remain separate release gates.
- [ ] Scan the full Git history for secrets, private media, generated projects and
      local Agent session data before merging the release to the default branch.
- [x] Provide a fresh-history public-snapshot command for repositories whose
      development history contains project-derived media.
- [x] Exclude the project-derived report archive from generated public source
      releases.
- [ ] Confirm publishing consent for the real product capture used by campaign
      assets, or recapture the same real UI with synthetic demo media before the
      default-branch release.

## Repository hygiene

- [x] Preserve the upstream MIT license and attribution.
- [x] Add the Moirai Cut contributors copyright line without removing upstream
      copyright.
- [x] Add independent-brand and non-affiliation notice.
- [x] Replace user-facing product copy and public package metadata with Moirai Cut.
- [x] Keep legacy project and protocol identifiers documented as compatibility
      surfaces.
- [x] Provide contribution, support, security, issue and pull-request guidance.
- [x] Provide an explicit brand and trademark-use policy.
- [x] Keep local `.env*`, build output, media cache and dependency folders ignored.
- [x] Use placeholders rather than live credentials in CI and `.env.example`.
- [ ] Verify that all links resolve after the canonical repository is renamed.

## Product and privacy disclosure

- [x] Local editing does not require an account.
- [x] Optional Agent providers and hosted features are described in the privacy
      page.
- [x] MCP access is opt-in and its local-project authority is documented.
- [x] Publish a network-egress table covering Codex, Claude, Marble, Freesound,
      analytics, local MCP and hosted infrastructure.
- [x] Document supported browsers, codecs, operating systems and known hardware
      acceleration limits.
- [x] Add an in-product first-run disclosure before sending selected project
      context to any external model provider.

## Release artifacts

- [x] Provide a versioned changelog and compatibility migration notes; publish
      them with the actual release.
- [ ] Tag the first public release and publish signed source archives plus
      checksums.
- [x] Provide reproducible source-archive, checksum, CycloneDX SBOM and
      dependency-audit automation; attach its output to the actual release.
- [ ] Verify clean-clone setup on macOS, Windows and Linux.
- [ ] Verify Codex and Claude MCP install/uninstall flows from a clean user
      profile.
- [ ] Verify browser-only Provider setup without an existing Agent CLI login.
- [ ] Verify project import, preview, undo/redo, MCP edit and final export on one
      representative project per supported platform.

## Suggested GitHub settings

- Default branch: `main`
- Required checks: Bun install, typecheck, ESLint, Agent tests, MCP tests, full
  test suite and production build
- Merge method: squash or rebase; keep migration commits easy to revert
- Features: Issues, Discussions, private vulnerability reporting
- Files: `CODEOWNERS`, release notes template and funding configuration once
  maintainers are known

## Compatibility policy

The public name is Moirai Cut. The following identifiers remain intentionally
stable until a versioned migration exists:

- `OPENCUT_*` environment variables;
- `opencut://` context URIs;
- `.opencut` portable project packages;
- `opencut-wasm` upstream compatibility dependency;
- the `opencut` MCP registration used by existing Agent tasks;
- existing `opencut_*` Docker volumes and database defaults.
- the transitional `HOLOCUT_PROJECTS_DIR` and `ONECUT_PROJECTS_DIR` aliases
  from pre-Moirai Cut builds.

`MOIRAI_PROJECTS_DIR` is available for new installs. Additional `MOIRAI_*`
aliases may be introduced later, but old identifiers must continue to work for
at least one documented migration window.

## Release command gate

Run from a fresh clone with the intended Bun version:

```bash
bun install --frozen-lockfile
bun test
bun run test:mcp
bun run typecheck:web
bun run lint:web
bun run build:web
bun audit
```

Do not make the repository public when a critical vulnerability, secret scan,
clean-clone test or licensing review is unresolved. Non-critical transitive
advisories may be accepted only when documented with impact, owner and upgrade
plan.

## Current working-tree verification

Verified locally on 2026-08-02 with Bun 1.3.14 from the macOS developer-preview
candidate:

- `bun test`: 767 passed, 0 failed across 151 files;
- `bun run test:mcp`: 7 passed, 0 failed;
- `bun run typecheck:web`: passed;
- `bun run lint:web`: passed;
- `NODE_ENV=production bun run build:web`: passed without build warnings or
  hosted-service credentials, generating all 22 static pages;
- `bun audit`: no vulnerabilities found;
- public-tree scan: 1,461 exported files in the staged preview tree; project
  report media and local IDE state remain excluded;
- CycloneDX 1.5 SBOM: 1,850 locked Bun and Cargo components;
- source archive: checksum passed and contained no reports, environment files or
  `director-agent` content;
- fresh public snapshot: includes the safe `.codex/config.toml` MCP entry while
  excluding project reports, `director-agent`, build artifacts and local state;
- editor goal report validation: 74 capabilities, 522 tests and 82 screenshots;
- Moirai Cut launch and logo PNG verification: all expected dimensions and formats
  passed.

The macOS fresh-history snapshot passed the same dependency install, tests,
MCP tests, typecheck, lint, production build and audit without `.env.local`.
This is not cross-platform release sign-off. The desktop Rust build was not
rerun because Cargo is not installed in this local environment. Docker Compose
configuration passed, but
the final container build could not download the pinned Bun base image because
Docker Hub authentication timed out on the current network. The current ignored
`.env.local` also has a legacy non-standard `NODE_ENV`; a standard production
environment builds successfully, and new setup runs remove that stale key.
