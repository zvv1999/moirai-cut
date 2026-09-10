# Release Audit Exceptions

## GHSA-vwc7-r8mq-g2x9 (2026-09-10)

`adm-zip` through 0.6.0 can follow destination symlinks during archive extraction.
The advisory currently has no patched npm release. The dependency is brought in
by `@huggingface/transformers -> onnxruntime-node`; Moirai imports Transformers
only in the browser transcription worker and does not call adm-zip extraction.
The native ONNX installer is not in the root `trustedDependencies` allowlist,
so its dependency install scripts are blocked by the documented Bun setup.

`bun run audit:release` exempts only this advisory. All other advisories remain
release blockers. The unfiltered JSON audit is attached to releases so this
exception remains visible. Do not enable onnxruntime-node installation scripts,
use npm installation that runs those scripts, or add server-side archive
extraction without reassessing this exception. Recheck upstream for a patched
release before each release and remove the exception once available.
