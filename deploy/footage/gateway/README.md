# Independent Team Access Gateway

The gateway provides a separate SSH endpoint on TCP 2222. Members authenticate
with individual public keys and ASCII login names. These are container accounts,
not DSM accounts; no NAS password or DSM administrator group is required.
The coordinator continues to own the library, while local workers do computation.

## Deploy

Build this directory as `moirai-team-gateway:v1` on the NAS. Provision a NAS-local,
root-owned directory with mode 700 containing:

- `keys/ssh_host_ed25519_key`: persistent SSH host key, root-owned, mode 600.
- `access/MEMBER`: OpenSSH public key lines prefixed with `restrict`, mode 644.
  Use a lowercase ASCII member name. Never place private member keys here.
- `secrets/service-token`: coordinator service token, owner root, group 10100,
  mode 640. The secrets directory must be root:10100, mode 750.

Explicitly apply permissions after creating files: NAS ACL inheritance can change
the modes requested at creation. The `access` directory must be root-owned and mode 755; the `keys` directory must
be root-owned and mode 700. Obtain the host public key through the authenticated
administrator connection and distribute a pinned `known_hosts` entry:

```text
[NAS_HOST]:2222 ssh-ed25519 HOST_PUBLIC_KEY
```

Run `run.sh` with `GATEWAY_ROOT`, `GATEWAY_BIND` and optionally `DOCKER` set.
It connects the existing `moirai-footage` container to a Docker network and starts
the gateway. It does not restart the coordinator or alter DSM users/SSH settings.
Use a fixed LAN bind address, and allow TCP 2222 only from the intended network.
Do not expose the coordinator's API to the LAN. Recreated coordinator containers
must be reattached to this network with the alias `moirai-footage`.

## Member Setup

Provide each member with this project's updated source, a `known_hosts` file and
a connection JSON containing `host`, `user`, `sshPort: 2222`,
`knownHostsFile: "known_hosts"`, and `port: 14318`. No service token is included
in this distribution: an authenticated bootstrap request retrieves it.

From the project directory, after installing Node 20.9+, Bun, Rust and FFmpeg:

```sh
bun install --frozen-lockfile
bun run join:team --connection /path/connection.json --identity /path/member-private-key
bun run team:llm
bun run team:start
```

Use the private key corresponding to the registered public key, not its `.pub`
file. For an encrypted key, first load it with `ssh-add /path/member-private-key`.
No password is transmitted or requested by the gateway. The host key is checked
strictly, and credentials are written to private files outside the checkout.

The generated configuration defaults to `~/.moirai-cut/footage-team.json`.
`team:llm` uses a hidden prompt for the LLM key. `team:start` automatically starts
or verifies the local relay, then starts the local worker and workbench.
Existing standalone configuration and existing model credentials are preserved.
For a custom configuration path, set `MOIRAI_FOOTAGE_CONFIG` for all commands.

## Permissions and Revocation

The SSH server only accepts `moirai-footage-config` and `moirai-footage-relay`.
Shell, SFTP, terminal allocation, agent forwarding and network forwarding are
disabled. Members execute as non-root users, and the gateway does not mount the
NAS media library, DSM homes, or Docker socket.

The underlying API still uses one shared service token. Authenticated members
have full library access; this does not implement application roles or per-action
attribution. Anyone with another route to the coordinator and a previously issued
token can still access it. Keep its API private and rotate its token if compromised.

To add a member, add their public key file under `access` and restart the gateway.
To revoke a member, remove their key file and restart the gateway to terminate
existing sessions. Other members reconnect automatically. Do not delete host keys
on restart. Rotate the gateway's copy whenever rotating the coordinator token.
