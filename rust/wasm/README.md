# opencut-wasm

Shared video editor logic compiled to WebAssembly. Moirai Cut keeps the published `opencut-wasm` package name for upstream compatibility.

## Install

```bash
npm install opencut-wasm
```

## Usage

```ts
import { formatTimecode, mediaTimeFromSeconds } from "opencut-wasm";

const ticks = mediaTimeFromSeconds(1.5);
const label = formatTimecode({ ticks });
```

`wasm-pack` generates the TypeScript definitions in
`rust/wasm/pkg/opencut_wasm.d.ts` during `bun run build:wasm`.

## Source

Functions are implemented in Rust under [`rust/crates/`](../crates/). This package is the compiled WebAssembly output — do not edit it directly.

## Local development

The web app depends on the published `opencut-wasm` package by default. If you are editing the WASM source in this repo and want `apps/web` to use your local build instead:

```bash
# From the repo root
bun run build:wasm

cd rust/wasm/pkg
bun link

cd ../../../apps/web
bun link opencut-wasm
```

While you work, rebuild on changes from the repo root:

```bash
bun dev:wasm
```
