"""Fixed-destination SSH command for NAS accounts without TCP forwarding."""
import os
import select
import socket
import sys

sock = socket.create_connection(('127.0.0.1', 4318), 10)
sock.settimeout(None)
inputs = [sock, sys.stdin]
while True:
    ready, _, _ = select.select(inputs, [], [])
    for source in ready:
        if source is sock:
            data = sock.recv(65536)
            if not data:
                sys.exit(0)
            output = getattr(sys.stdout, 'buffer', sys.stdout)
            output.write(data)
            output.flush()
        else:
            data = os.read(0, 65536)
            if not data:
                sock.shutdown(socket.SHUT_WR)
                inputs.remove(sys.stdin)
            else:
                sock.sendall(data)
