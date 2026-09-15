import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const configPath = path.resolve(process.argv[2]);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const required = ['host', 'user', 'identityFile', 'knownHostsFile'];
for (const key of required) {
  if (typeof config[key] !== 'string' || !config[key] || config[key].startsWith('-')) {
    throw new Error(`Missing or invalid ${key}`);
  }
}
const port = config.port ?? 14318;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const children = new Set();
const server = net.createServer(socket => {
  const ssh = spawn('ssh', [
    '-T', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10',
    '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
    '-o', `UserKnownHostsFile=${config.knownHostsFile}`,
    '-i', config.identityFile, `${config.user}@${config.host}`, 'moirai-footage-relay',
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  children.add(ssh);
  socket.pipe(ssh.stdin);
  ssh.stdout.pipe(socket);
  ssh.stderr.on('data', data => process.stderr.write(data));
  ssh.stdin.on('error', () => socket.destroy());
  ssh.on('error', error => { console.error(error.message); socket.destroy(); });
  ssh.on('close', () => { children.delete(ssh); socket.destroy(); });
  socket.on('error', () => ssh.kill());
  socket.on('close', () => ssh.kill());
});
server.listen(port, '127.0.0.1', () => console.log(`NAS footage connection: 127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    for (const ssh of children) ssh.kill();
  });
}
