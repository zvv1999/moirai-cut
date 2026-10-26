# Release Audit Exceptions

## Current policy (2026-10-26)

There are no active release audit exceptions. `bun run audit:release` runs the
unfiltered `bun audit`; any reported vulnerability blocks release. Keep the full
JSON result with each release so the audit date and resolved dependency tree can
be inspected. A clean audit means no advisories were reported for that tree at
the time of the check, not that the software is free of all vulnerabilities.

## Retired: GHSA-vwc7-r8mq-g2x9

`adm-zip` through 0.6.0 can follow destination symlinks during archive extraction.
The dependency is brought in
by `@huggingface/transformers -> onnxruntime-node`; Moirai imports Transformers
only in the browser transcription worker and does not call adm-zip extraction.
The native ONNX installer is not in the root `trustedDependencies` allowlist,
so its dependency install scripts are blocked by the documented Bun setup.

Earlier releases accepted this narrowly scoped exception while no patched npm
release was available. Version 0.8.0 resolves `adm-zip` to 0.6.1 and removes the
audit ignore. The 2026-10-26 audit reports no remaining advisories for the updated
lockfile. The native ONNX installation scripts remain outside the allowlist.
