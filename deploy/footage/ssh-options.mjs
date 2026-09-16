import path from 'node:path';

export function sshOptions(config) {
  if (typeof config.host !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/.test(config.host)) throw Error('Invalid SSH host');
  if (typeof config.user !== 'string' || !/^[a-z_][a-zA-Z0-9_-]*$/.test(config.user)) throw Error('Use the ASCII team login name');
  for (const key of ['identityFile', 'knownHostsFile']) {
    if (typeof config[key] !== 'string' || !path.isAbsolute(config[key]) || /[\r\n]/.test(config[key])) throw Error(`Invalid ${key}`);
  }
  const sshPort = config.sshPort ?? 22;
  if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) throw Error('Invalid SSH port');
  return ['-T', '-p', String(sshPort), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10',
    '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
    '-o', `UserKnownHostsFile="${config.knownHostsFile.replaceAll('\\', '/').replaceAll('"', '\\"')}"`, '-i', config.identityFile,
    `${config.user}@${config.host}`];
}
