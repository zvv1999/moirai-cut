#!/usr/bin/python3
"""SSH deployment adapter: authenticated bootstrap or fixed API byte stream."""
import json
import os
import pwd
import select
import socket
import sys

command = os.environ.get('SSH_ORIGINAL_COMMAND', '')
if command == 'moirai-footage-config':
    with open('/secrets/service-token') as stream:
        token = stream.read().strip()
    if not token or '\n' in token or '\r' in token:
        raise RuntimeError('Invalid coordinator token')
    print(json.dumps({'version': 1, 'member': pwd.getpwuid(os.getuid()).pw_name,
                      'serviceToken': token}))
elif command == 'moirai-footage-relay':
    with socket.create_connection(('moirai-footage', 4318), 10) as sock:
        sock.settimeout(None)
        inputs = [sock, sys.stdin.buffer]
        while True:
            ready, _, _ = select.select(inputs, [], [])
            for source in ready:
                if source is sock:
                    data = sock.recv(65536)
                    if not data:
                        sys.exit(0)
                    sys.stdout.buffer.write(data)
                    sys.stdout.buffer.flush()
                else:
                    data = os.read(0, 65536)
                    if not data:
                        sock.shutdown(socket.SHUT_WR)
                        inputs.remove(sys.stdin.buffer)
                    else:
                        sock.sendall(data)
else:
    print('Only Moirai team configuration and API access are permitted.', file=sys.stderr)
    sys.exit(126)
