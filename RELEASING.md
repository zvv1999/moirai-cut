# Releasing Moirai Cut

This runbook creates reviewable evidence; it does not make a repository public,
register a name, publish a package or create a GitHub release automatically.

## 1. External launch gates

- Obtain professional name and trademark clearance in each launch region.
- Confirm the canonical organization, repository, domain and social handles.
- Confirm at least two maintainers, private vulnerability reporting and branch
  protection.
- Audit the complete Git history for secrets, private media, projects and Agent
  sessions. The working-tree checker is not a history scanner.
- Confirm publishing rights for every public screenshot and campaign asset.

## 2. Clean-clone verification

From a temporary directory and the exact candidate commit:

```bash
git clone --no-local <candidate-repository-url> moirai-cut-release
cd moirai-cut-release
bun install --frozen-lockfile
bun run release:check
bun test
bun run test:mcp
bun run typecheck:web
bun run lint:web
NODE_ENV=production bun run build:web
bun audit
```

For an upstream advisory without a patched version, review the narrowly scoped
exception in `docs/security-release-exceptions.md` and run `bun run audit:release`.
Always retain the unfiltered audit JSON in the release evidence; do not describe
a release with an exception as vulnerability-free.

Repeat the install, Agent setup, representative edit and export smoke tests on
macOS, Windows and Linux. Record the commit SHA, OS, browser, Bun, FFmpeg and
result in the release issue.

If the development history contains project-derived media, create a new local
root commit instead of rewriting the working repository in place:

```bash
bun run release:public-snapshot
```

The snapshot copies the current tracked and non-ignored source tree, excludes
`docs/reports`, `director-agent`, local Agent configuration and generated
artifacts, initializes a sibling `moirai-cut-public-snapshot` repository on a fresh
`main` branch, and runs the public-tree check.
Review and test that separate repository before pushing it to a new public
remote. Never force-push a cleaned history over a shared repository without a
separate migration and rollback plan.

## 3. Reproducible evidence

```bash
bun run release:source
bun run release:sbom
bun audit --json > artifacts/sbom/bun-audit.json
```

`release:source` uses `git archive`; `.gitattributes` excludes project-derived
acceptance reports and repository-only tooling. The command writes a SHA-256
checksum beside the source archive. `release:sbom` creates a CycloneDX 1.5 SBOM
from installed Bun packages and the locked Cargo packages.

The “Release readiness” GitHub workflow runs the same artifact steps for a tag
or a manual rehearsal and retains the evidence without publishing a release.

## 4. Tag and publish

1. Update `CHANGELOG`, version fields and migration notes.
2. Review `git diff`, dependency audit, SBOM and source-archive contents.
3. Create a signed annotated tag: `git tag -s vX.Y.Z`.
4. Push the candidate branch and tag only after owner approval.
5. Create a GitHub release from the signed tag and attach the archive,
   checksum, SBOM and audit output.
6. Verify download checksums and installation from the published release.

Package registries and hosted deployments are separate releases. Do not publish
the compatibility package `opencut-wasm` under a new owner without an explicit
upstream migration plan.

## 5. Rollback

- Stop or mark a bad release as pre-release; do not delete evidence silently.
- Revert the smallest responsible commit and publish a patched version.
- If project data can be affected, block the migration, preserve backups and
  publish recovery steps before asking users to retry.
- For a security incident, follow the private advisory and coordinated
  disclosure process in `.github/SECURITY.md`.
