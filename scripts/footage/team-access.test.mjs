import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { sshOptions } from '../../deploy/footage/ssh-options.mjs';

const config = { host: 'nas.example.test', user: 'team_member', sshPort: 2222,
  identityFile: path.resolve('private key'), knownHostsFile: path.resolve('team access/known_hosts') };

test('team SSH pins identity, host key and dedicated port, including paths with spaces', () => {
  const args = sshOptions(config);
  assert.equal(args[args.indexOf('-p') + 1], '2222');
  assert.ok(args.includes('StrictHostKeyChecking=yes'));
  assert.ok(args.includes('BatchMode=yes'));
  assert.ok(args.includes('IdentitiesOnly=yes'));
  assert.ok(args.includes(`UserKnownHostsFile="${config.knownHostsFile.replaceAll('\\', '/')}"`));
  assert.equal(args.at(-1), 'team_member@nas.example.test');
  assert.equal(sshOptions({ ...config, sshPort: undefined })[2], '22');
});

test('team SSH rejects option injection, nonportable logins and malformed ports', () => {
  for (const invalid of [{ host: '-oProxyCommand=bad' }, { host: 'nas\nother' },
    { user: 'root;command' }, { user: '\u65bd\u5f6c\u714c' }, { sshPort: 0 },
    { sshPort: '2222' }, { identityFile: 'relative' }, { knownHostsFile: '/tmp/file\nother' }]) {
    assert.throws(() => sshOptions({ ...config, ...invalid }));
  }
});
