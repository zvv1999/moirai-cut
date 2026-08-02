# Security Policy

## Supported versions

Security fixes are applied to the latest commit on the actively maintained branch. Pre-release builds may change quickly and are not guaranteed long-term support.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's **Report a vulnerability** flow in the repository Security tab to start a private security advisory.

Include:

- affected commit or version;
- reproduction steps or a minimal proof of concept;
- expected impact and attack prerequisites;
- any suggested mitigation;
- whether the issue exposes local media, project files, credentials or Agent access.

Please do not test against systems, accounts or media you do not own. We target
an acknowledgement within three business days and an initial severity/status
assessment within seven business days. These are response targets, not a patch
guarantee. We will coordinate disclosure after a fix or mitigation is available.

## Security-sensitive surfaces

Treat project files, imported media, sampled frames, local paths, Provider
credentials, Agent task content, MCP tools and the loopback shared app-server as
sensitive. Moirai Cut's local-first default is not a sandbox: installing MCP access
authorizes the selected Agent to read and modify projects available to that
process.
