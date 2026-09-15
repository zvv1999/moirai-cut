FROM rust:1.93.1-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY rust/ rust/
COPY apps/desktop/ apps/desktop/
RUN cargo build --locked --release --jobs 2 -p moirai-footage

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home moirai
COPY --from=build /src/target/release/moirai-footage /usr/local/bin/moirai-footage
COPY deploy/footage/runtime.json /etc/moirai/runtime.json
ENV HOME=/home/moirai MOIRAI_FOOTAGE_CONFIG=/etc/moirai/runtime.json MOIRAI_FOOTAGE_BIND=0.0.0.0
USER 10001:10001
EXPOSE 4318
CMD ["moirai-footage"]
