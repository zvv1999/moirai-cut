FROM oven/bun:1.3.14-alpine AS base

FROM rust:1.93.1-alpine AS interchange-builder

WORKDIR /app

# Cargo resolves the complete workspace even when building one package. Keep
# every workspace member manifest/source available while compiling the small
# interchange CLI as an independent production artifact.
COPY Cargo.toml Cargo.lock ./
COPY rust/ rust/
COPY apps/desktop/ apps/desktop/
RUN cargo build --locked --release -p interchange --bin moirai-interchange
RUN cargo build --locked --release -p moirai-agent-analysis -p moirai-project-export

FROM base AS builder

WORKDIR /app

ARG NEXT_PUBLIC_MARBLE_API_URL=https://api.marblecms.com

COPY package.json package.json
COPY bun.lock bun.lock
COPY turbo.json turbo.json

COPY apps/web/package.json apps/web/package.json
COPY apps/mcp/package.json apps/mcp/package.json
RUN bun install --frozen-lockfile

COPY apps/web/ apps/web/
COPY apps/mcp/ apps/mcp/
COPY rust/agent-analysis.mjs rust/agent-analysis.d.mts ./rust/

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Public build configuration is safe to inline. Optional hosted-service
# credentials stay unset here and must be provided only to the runtime.
ENV NEXT_PUBLIC_SITE_URL="http://localhost:3000"
ENV NEXT_PUBLIC_MARBLE_API_URL=$NEXT_PUBLIC_MARBLE_API_URL

WORKDIR /app/apps/web
RUN bun run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache curl ffmpeg zip
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=interchange-builder --chown=nextjs:nodejs /app/target/release/moirai-interchange /usr/local/bin/moirai-interchange
COPY --from=interchange-builder --chown=nextjs:nodejs /app/target/release/moirai-agent-analysis /usr/local/bin/moirai-agent-analysis
COPY --from=interchange-builder --chown=nextjs:nodejs /app/target/release/moirai-project-export /usr/local/bin/moirai-project-export
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/mcp ./apps/mcp
COPY --from=builder --chown=nextjs:nodejs /app/rust/agent-analysis.mjs ./rust/agent-analysis.mjs
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/bun.lock ./

RUN bun install --production --frozen-lockfile --filter @moirai-cut/mcp

RUN chown nextjs:nodejs apps

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV MOIRAI_INTERCHANGE_BIN="/usr/local/bin/moirai-interchange"
ENV MOIRAI_AGENT_ANALYSIS_BIN="/usr/local/bin/moirai-agent-analysis"
ENV MOIRAI_PROJECT_EXPORT_BIN="/usr/local/bin/moirai-project-export"

CMD ["bun", "apps/web/server.js"]
