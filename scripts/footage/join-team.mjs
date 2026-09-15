import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sshOptions } from '../../deploy/footage/ssh-options.mjs';
import { ensureTeamRelay } from './team-relay.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw Error(`Missing ${name}`);
  return value;
}
function save(file, content) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
  renameSync(temporary, file);
  chmodSync(file, 0o600);
}
const input = option('--connection');
if (!input) throw Error('Usage: bun run join:team --connection /path/connection.json --identity /path/private-key');
const descriptorPath = path.resolve(input);
const connection = JSON.parse(readFileSync(descriptorPath, 'utf8'));
const identity = option('--identity') || connection.identityFile;
if (!identity) throw Error('Provide --identity with your own SSH private key path');
connection.identityFile = path.resolve(identity);
connection.knownHostsFile = path.resolve(path.dirname(descriptorPath), connection.knownHostsFile || 'known_hosts');
if (!existsSync(connection.identityFile)) throw Error('SSH private key does not exist');
if (!existsSync(connection.knownHostsFile)) throw Error('Missing administrator-provided known_hosts');
connection.port ??= 14318;
if (!Number.isInteger(connection.port) || connection.port < 1024 || connection.port > 65535) throw Error('Invalid local relay port');
const file = path.resolve(option('--config') || process.env.MOIRAI_FOOTAGE_CONFIG || path.join(homedir(), '.moirai-cut/footage-team.json'));
const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
if (old.dataDir && !old.serverUrl) throw Error('Refusing to overwrite standalone configuration');
const login = spawnSync('ssh', [...sshOptions(connection), 'moirai-footage-config'], { encoding: 'utf8', timeout: 20000, maxBuffer: 65536 });
if (login.error || login.status !== 0) throw Error(`Team login failed. Verify key, account and host fingerprint. ${login.stderr || login.error?.message || ''}`);
let bootstrap;
try { bootstrap = JSON.parse(login.stdout); }
catch { throw Error('Team server returned an invalid configuration response'); }
if (bootstrap.version !== 1 || bootstrap.member !== connection.user || typeof bootstrap.serviceToken !== 'string' || !bootstrap.serviceToken || /[\r\n]/.test(bootstrap.serviceToken)) throw Error('Invalid team bootstrap response');
const privateDir = `${file}.access`;
const connectionFile = path.join(privateDir, 'service-token.ssh.json');
const knownHostsFile = path.join(privateDir, 'known_hosts');
save(knownHostsFile, readFileSync(connection.knownHostsFile));
connection.knownHostsFile = knownHostsFile;
save(connectionFile, JSON.stringify(connection, null, 2) + '\n');
const serverTokenFile = path.join(privateDir, 'service-token');
save(serverTokenFile, bootstrap.serviceToken + '\n');
const config = { ...old, serverUrl: `http://127.0.0.1:${connection.port}`, serverTokenFile,
  dataDir: old.dataDir || path.join(privateDir, 'worker'),
  workerId: old.workerId || randomUUID(), port: old.port || 14319,
  ffmpeg: old.ffmpeg || 'ffmpeg', ffprobe: old.ffprobe || 'ffprobe' };
if (config.port === connection.port) throw Error('Worker and relay ports must differ');
await ensureTeamRelay(config);
save(file, JSON.stringify(config, null, 2) + '\n');
console.log(`Team login verified: ${bootstrap.member}\nConfiguration: ${file}\nConfigure local LLM: bun run team:llm\nStart workbench: bun run team:start`);
