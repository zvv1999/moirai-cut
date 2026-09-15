import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sshOptions } from '../../deploy/footage/ssh-options.mjs';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const connection = JSON.parse(readFileSync(`${config.serverTokenFile}.ssh.json`, 'utf8'));
const args = sshOptions(connection);
function ssh(extra) {
  return spawnSync('ssh', [...extra, ...args.filter(arg => arg !== '-T'), 'id'], { encoding: 'utf8', timeout: 15000 });
}
const command = ssh([]);
assert.equal(command.status, 126, 'Arbitrary commands must be denied');
assert.ok(!command.stdout.includes('uid='), 'No shell output may be returned');
const forwarding = ssh(['-W', '127.0.0.1:4318']);
assert.notEqual(forwarding.status, 0, 'TCP forwarding must fail');
assert.match(forwarding.stderr, /administratively prohibited|stdio forwarding failed/);
const terminal = ssh(['-tt']);
assert.notEqual(terminal.status, 0, 'PTY requests must fail');
assert.match(terminal.stderr, /PTY allocation request failed/);
const token = readFileSync(config.serverTokenFile, 'utf8').trim();
const denied = await fetch(`${config.serverUrl}/state`, { signal: AbortSignal.timeout(10000) });
assert.equal(denied.status, 401);
await denied.body?.cancel();
const state = await fetch(`${config.serverUrl}/state`, { headers: { 'x-footage-token': token }, signal: AbortSignal.timeout(10000) });
assert.equal(state.status, 200);
await state.json();
console.log('PASS: restricted commands, TCP forwarding, PTY, API authentication and shared state');
