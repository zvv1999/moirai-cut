# NAS Footage Service

This is a single-owner Rust API container, not a complete multi-user web deployment.
Run it on the NAS itself using a local ext4/btrfs volume. Never point its database
at a Docker SMB/NFS volume. The service rejects network database filesystems and
holds an exclusive library lock for the lifetime of the database connection.
All team clients connect to this one service; they must not open its database.

This deployment also runs footage analysis and rendering workers on the NAS.
The local Web adapter only transports requests; connecting it does not move
FFmpeg or model calls to the client. Edge computation is not implemented yet:
it requires a local Rust worker, server-side job leases and heartbeats, and
validated result/media submission with revision checks and retry idempotency.
In that architecture the NAS owns shared records and media, while each client
owns its media cache, 720p proxy generation, processing and LLM credentials.

## Deployment

Requires NAS Docker/Compose administration, an amd64/arm64 Linux CPU, free space
for Rust compilation and media processing, and FFmpeg CPU capacity. From this
directory on the NAS (choose an empty deployment directory for first validation):

```sh
mkdir -p state library model
sudo chown -R 10001:10001 state library model
docker compose build
docker compose up -d
docker compose ps
```

The default limits are 1536 MiB memory, CPU cores 0 and 1, and three 10 MiB
log files. CPU affinity also works on DSM kernels without CFS CPU quotas.

Without Compose, build the image from the repository root with
`docker build -t moirai-footage:local -f deploy/footage/Dockerfile .`, then run
`sudo sh deploy/footage/run.sh`. `DOCKER_BIN` selects DSM's Docker binary and
`MOIRAI_FOOTAGE_IMAGE` selects an already-built image. The launcher refuses to
replace an existing container automatically.

The files under `state` and `model` must not be exposed through a team SMB share:
they contain service authentication and optional model credentials. The model
file uses `footage-endpoint.json` with `baseUrl` and `apiKey`, permissions 0600.
AI analysis remains unavailable until an endpoint is configured. AI adaptive LUT
Python/PyTorch dependencies are not bundled in this minimal CPU container.

## Client Connection

This initial deployment binds the host port to loopback. Use an authorized SSH
account to forward a local port; do not publish the unauthenticated web editor
or this bearer-token API directly on the Internet.

```sh
ssh -N -L 14318:127.0.0.1:4318 user@nas-host
```

Configure the local Web adapter's `MOIRAI_FOOTAGE_CONFIG` to a private JSON file:
`{"dataDir":"/absolute/private/team-client","port":14318}`. Place the NAS service's
`state/service-token` in that directory as `service-token` (0600), transferred using
the authorized encrypted SSH connection. Restart the local Web process with that
configuration; do not run `setup:local` against the remote-adapter configuration.
Every member with this token has full library access; per-user roles are not yet
implemented. Revoking a member requires rotating the service token and restarting.

### DSM Without SSH Port Forwarding

Keep global forwarding disabled. An administrator can install `relay.py` outside
team-writable directories and add a dedicated client public key to its SSH account:

```text
command="python -u /absolute/deployment/relay.py",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 PUBLIC_KEY
```

The forced command only connects to the API on loopback port 4318. Use `python3`
instead of `python` where needed. Keep the private key and verified host key on
the client. Create a private connection JSON with `host`, `user`, `identityFile`,
`knownHostsFile` (absolute paths), and `port` (14318). Start the local relay with:

```sh
node deploy/footage/connect.mjs /absolute/private/connection.json
```

Use the same Web adapter configuration above. This requires Node.js and OpenSSH
on each client; it never stores a NAS administrator password. Remove that public
key from `authorized_keys` to revoke its SSH connection.

Open the local `/footage` UI. On first setup select **folder** `/library`: this is
the server's NAS-local path, not a client mount. The runtime configuration and
library root must remain separate. API requests and media stream through the
SSH tunnel; clients never depend on another machine's absolute media paths.
Editor imports keep project-local copies. Reverse usage lookup still covers only
projects accessible to the server, not all members' private local projects.

## Migration and Recovery

Stop old versions before migrating. Keep backups of the old local database and
media. Registered old libraries migrate through a whitelist snapshot into a
staged directory; source/output paths are rebased, and machine tokens and sibling
libraries are excluded. If the selected directory is unavailable, opening fails
instead of silently writing a stale local copy. Restore access before restarting.
Changing the mount path requires exclusive ownership; stored paths are rebased.
To back up the database safely, stop this container and copy `state` and `library`
to a versioned backup destination; do not live-copy SQLite/WAL files.

Deployment validation: check health, reject a wrong token, upload a disposable
video, verify a second client sees the same record, restart and verify persistence.
Do not run verification uploads through the LLM without explicit authorization.
