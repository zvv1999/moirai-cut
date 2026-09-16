FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssh-server python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10100 moirai-access
COPY sshd_config /etc/ssh/sshd_config
COPY entrypoint.py /usr/local/bin/moirai-gateway
COPY access.py /usr/local/bin/moirai-access
RUN chmod 755 /usr/local/bin/moirai-gateway /usr/local/bin/moirai-access
EXPOSE 2222
ENTRYPOINT ["/usr/local/bin/moirai-gateway"]
