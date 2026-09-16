# NAS Footage Service

This is a single-owner Rust API container, not a complete multi-user web deployment.
Run it on the NAS itself using a local ext4/btrfs volume. Never point its database
at a Docker SMB/NFS volume. The service rejects network database filesystems and
holds an exclusive library lock for the lifetime of the database connection.
All team clients connect to this one service; they must not open its database.

The launchers enable `MOIRAI_FOOTAGE_COORDINATOR=1`. The NAS owns shared records,
media, publication and job leases. Each client runs a local Rust gateway/worker
for archive preparation, 720p model proxies, analysis, tagging, product recognition,
reanalysis and rendering. LLM credentials remain on each client. SQLite never
crosses the network. Without a connected worker, compute jobs stay queued.

Workers renew 120-second leases every 15 seconds. An expired lease may be reassigned;
stale results cannot commit. Completion checks target metadata and changed records,
validates media hashes/paths, and records an idempotent receipt. Uploaded originals
are cached locally by SHA-256; recently active importers get a 30-second preference.
Media transfer supports offsets and 4 MiB upload chunks. A failed response can be
retried without duplicating a completed task. Local work is retained on failure;
after lease expiry the task may recompute rather than reuse its previous result.

## Deployment

Requires NAS Docker/Compose administration, an amd64/arm64 Linux CPU, free space
for Rust compilation and media storage. From this
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

The files under `state` must not be exposed through a team SMB share: they contain
service authentication. The coordinator does not mount the `model` directory.
Each worker uses its own `~/.moirai-cut/footage-endpoint.json` (0600), or its existing
Agent endpoint fallback. AI adaptive LUT Python/PyTorch dependencies must be
installed on the worker computer when using that color mode.

## Client Connection

This initial deployment binds the host port to loopback. Use an authorized SSH
account to forward a local port; do not publish the unauthenticated web editor
or this bearer-token API directly on the Internet.

```sh
ssh -N -L 14318:127.0.0.1:4318 user@nas-host
```

Transfer the NAS `state/service-token` to a private client file (0600) using the
authorized encrypted SSH connection. Run `bun run setup:team`, which asks for the
team API URL, token file path, local cache directory and local port. It defaults
to `~/.moirai-cut/footage-team.json`, leaving standalone configuration intact.
Set `MOIRAI_FOOTAGE_CONFIG` to that file and run `bun run setup:local`. Both the
local Web shell and native service must receive the same file. `dev:footage` and
`setup:local` detect `serverUrl` and start the Rust worker with `--edge`.

Example configuration (all paths are client-local):

```json
{
  "serverUrl": "http://127.0.0.1:14318",
  "serverTokenFile": "/absolute/private/nas-service-token",
  "dataDir": "/absolute/local/team-cache",
  "workerId": "cefd17b8-45ec-48ad-8339-27c245254b67",
  "port": 14319,
  "ffmpeg": "/absolute/path/ffmpeg",
  "ffprobe": "/absolute/path/ffprobe"
}
```

Generate a different worker UUID for every computer. The local worker generates
its own separate `service-token` for the Web adapter. `GET /edge/status` reports
its current stage; `/state` reports the local model endpoint and worker status.
To configure LLM credentials, run `setup:footage` with the team config selected;
the key is entered through the hidden terminal prompt and never sent to the NAS.
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

Point the worker's `serverUrl` to that local relay. This requires Node.js and OpenSSH
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

## Current Boundaries

The main asynchronous compute pipeline runs locally. The coordinator still probes
media on import/editor reads and normalizes uploaded product reference images.
Preview geometry, exposure and adaptive LUT computation run on the local worker.
The worker fetches authorized metadata and caches SHA-256-verified originals;
the coordinator must support `/media/source/{id}/original`. Install the LUT model
on each workstation, not on the NAS. The coordinator also hashes/copies published
files. It therefore still needs FFmpeg/ffprobe; this is not a pure
storage-only server. Team mode currently requires an online coordinator for
imports/review; disconnected writes are not queued for later synchronization.
Every preview checks the current library ID and active shot/source metadata,
including when the original or LUT is already cached locally. Stale pages must
refresh after a library switch. Preview responses are private and not HTTP-cached;
the worker's verified media and LUT caches remain reusable.
Standalone local mode remains independent and fully available without NAS.
Caches and unreferenced staged blobs do not yet have automatic quota eviction.

## Verification

Run `cargo test -p moirai-footage`. With native `MOIRAI_FFMPEG` and
`MOIRAI_FFPROBE` set, build the binary and run
`node scripts/footage/verify-edge.mjs` and the same command with `--model`.
The tests use synthetic media, a coordinator with FFmpeg disabled, a local worker,
an optional localhost mock model that inspects 720p inputs, and a second API client.
The unconfigured-model run checks manual recovery. Neither run calls a real LLM.
For an existing NAS test deployment, set `MOIRAI_TEAM_URL` and
`MOIRAI_TEAM_TOKEN_FILE`; the test adds one synthetic source and release.
Do not run verification uploads through a real LLM without explicit authorization.
