#!/usr/bin/python3
import os
import re
import pwd
import subprocess

os.makedirs('/run/sshd', mode=0o755, exist_ok=True)
members = sorted(os.listdir('/access'))
if not members:
    raise RuntimeError('No team members configured')
for index, member in enumerate(members):
    if not re.fullmatch(r'[a-z][a-z0-9_-]{0,31}', member):
        raise RuntimeError('Invalid member login name')
    try:
        account = pwd.getpwnam(member)
        if account.pw_uid < 11000 or account.pw_gid != 10100:
            raise RuntimeError('Conflicting system account')
    except KeyError:
        uid = max([10999] + [p.pw_uid for p in pwd.getpwall() if p.pw_gid == 10100]) + 1
        subprocess.run(['useradd', '--no-create-home', '--home-dir', '/', '--uid', str(uid),
                        '--gid', 'moirai-access', '--password', '*', '--shell', '/bin/sh',
                        member], check=True)
os.execv('/usr/sbin/sshd', ['/usr/sbin/sshd', '-D', '-e'])
