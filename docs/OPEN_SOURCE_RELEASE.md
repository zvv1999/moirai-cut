# OneCut open-source release checklist

## Blocking before public launch

- [ ] Complete trademark and domain clearance for **OneCut** in target regions. Several unrelated video products already use the same name, so repository branding is not legal clearance.
- [ ] Rename the GitHub repository and update clone URLs, social links, package metadata and deployment URLs.
- [ ] Configure a project-owned domain through `NEXT_PUBLIC_SITE_URL`.
- [ ] Enable GitHub private vulnerability reporting, Discussions and branch protection.
- [ ] Confirm maintainers, response expectations and release signing policy.
- [ ] Run the complete quality gate and archive results with the release.

## Repository hygiene

- [x] Preserve the upstream MIT license and attribution.
- [x] Add independent-brand and non-affiliation notice.
- [x] Replace user-facing OpenCut name and logo with original OneCut assets.
- [x] Keep legacy project and protocol identifiers documented as compatibility surfaces.
- [x] Provide contribution, support, security, issue and pull-request guidance.
- [x] Scan the current tracked tree for credential patterns, private media and personal workstation paths; only synthetic test paths remain.
- [x] Verify the new OneCut campaign and logo assets at full size and in critical crops.
- [ ] Scan the full Git history for secrets and generated project data before making the repository public.
- [ ] Review the pre-existing report screenshot archive for publishing consent and personal file information.

## Release artifacts

- [ ] Publish signed source archives and checksums.
- [ ] Add a versioned changelog and migration notes.
- [ ] Document supported browsers, codecs and operating systems.
- [ ] Document optional network services and what data leaves the device.
- [ ] Verify clean-clone setup on macOS, Windows and Linux.
- [ ] Verify Codex and Claude MCP install/uninstall flows from a clean user profile.

## Compatibility policy

The public name is OneCut. The following identifiers remain intentionally stable until a versioned migration exists:

- `OPENCUT_*` environment variables;
- `opencut://` context URIs;
- `.opencut` portable project packages;
- `opencut-wasm` upstream compatibility dependency;
- the `opencut` MCP registration used by existing Agent tasks.

New aliases may be introduced, but old identifiers must continue to work for at least one documented migration window.
