import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const config = process.env.MOIRAI_FOOTAGE_CONFIG || path.join(homedir(), '.moirai-cut/footage-team.json');
if (!existsSync(config)) throw Error('Run join:team first');
const action = process.argv[2];
if (!['start', 'llm'].includes(action)) throw Error('Expected start or llm');
const child = spawn('bun', ['run', action === 'start' ? 'setup:local' : 'setup:footage'], {
  cwd: fileURLToPath(new URL('../../', import.meta.url)), stdio: 'inherit',
  env: { ...process.env, MOIRAI_FOOTAGE_CONFIG: config },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
