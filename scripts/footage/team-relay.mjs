import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function ensureTeamRelay(config) {
  if (!config.serverTokenFile) return;
  const connectionFile = `${config.serverTokenFile}.ssh.json`;
  if (!existsSync(connectionFile)) return;
  const connection = JSON.parse(readFileSync(connectionFile, 'utf8'));
  const port = connection.port ?? 14318;
  if (config.serverUrl !== `http://127.0.0.1:${port}`) throw Error('Team relay address does not match connection file');
  const token = readFileSync(config.serverTokenFile, 'utf8').trim();
  async function ready() {
    try {
      const response = await fetch(`${config.serverUrl}/state`, { headers: { 'x-footage-token': token }, signal: AbortSignal.timeout(3000) });
      await response.body?.cancel();
      return response.ok;
    } catch { return false; }
  }
  if (await ready()) return;
  const occupied = await new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
  if (occupied) throw Error(`Port ${port} is occupied or team authentication failed; check the existing relay`);
  mkdirSync(config.dataDir, { recursive: true });
  const log = openSync(path.join(config.dataDir, 'team-relay.log'), 'a', 0o600);
  const script = fileURLToPath(new URL('../../deploy/footage/connect.mjs', import.meta.url));
  const child = spawn(process.execPath, [script, connectionFile], { detached: true, stdio: ['ignore', log, log] });
  closeSync(log);
  let failure;
  child.on('error', error => { failure = error; });
  child.unref();
  for (let attempt = 0; attempt < 15; attempt++) {
    if (failure || child.exitCode !== null) break;
    if (await ready()) return;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  child.kill();
  throw Error(`Team connection failed; see ${path.join(config.dataDir, 'team-relay.log')}`);
}
