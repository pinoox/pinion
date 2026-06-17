# @pinooxhq/pinion-client

Browser client for the **[Pinion](https://github.com/pinoox/pinion)** resumable upload protocol.

Works **with or without Axios** — `fetch` by default, Axios when you already use it.

---

## Quick start

```bash
npm install @pinooxhq/pinion-client
```

```javascript
import { uploadFile } from '@pinooxhq/pinion-client';

await uploadFile(file, {
  baseURL: '/api/pinion',
  unwrapPreset: 'pinoox',
  onProgress: ({ percent }) => console.log(percent + '%'),
});
```

That is the whole idea: **init → upload parts → complete** — handled for you.

---

## Table of contents

- [Quick start](#quick-start)
- [Features](#features)
- [Install](#install)
- [Ways to use](#ways-to-use)
  - [1 — One function](#1--one-function-fastest)
  - [2 — Fluent API](#2--fluent-api-reusable)
  - [3 — Full client](#3--full-client-batch--hooks)
  - [4 — Low-level steps](#4--low-level-steps-manual)
  - [5 — With Axios](#5--with-axios-optional)
  - [6 — Custom transport](#6--custom-transport)
- [Transport](#transport)
- [Framework patterns](#framework-patterns)
- [Advanced](#advanced)
- [HTTP rules](#http-rules)
- [API reference](#api-reference)
- [Publish to npm](#publish-to-npm)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

| Feature | Description |
|---------|-------------|
| Zero deps | Native `fetch` — no Axios required |
| Axios optional | Pass Axios for `onUploadProgress` per chunk |
| Resume | `fingerprint` + `localStorage` session cache |
| Parallel parts | Upload multiple chunks at once (default `2`) |
| Retry | Auto-retry failed parts with backoff |
| Checksums | SHA-256 `chunk_hash` per part |
| Progress | `percent`, `bytes`, `speed`, `eta` |
| Unwrap presets | `pinoox`, `laravel`, `flat`, `raw` |
| Batch upload | `uploadMany()` for multiple files |
| TypeScript | Full `.d.ts` included |
| Cancel | `AbortSignal` or `client.cancel()` |

---

## Install

```bash
# fetch only (recommended)
npm install @pinooxhq/pinion-client
```

```bash
# with Axios (optional peer dependency)
npm install @pinooxhq/pinion-client axios
```

```bash
yarn add @pinooxhq/pinion-client
pnpm add @pinooxhq/pinion-client
```

Requires **Node.js 18+** or a modern browser with `fetch`.

---

## Ways to use

Pick the style that fits your project — from one-liner to full control.

### 1 — One function (fastest)

Best for a single upload button. No setup object needed.

```javascript
import { uploadFile } from '@pinooxhq/pinion-client';

const result = await uploadFile(file, {
  baseURL: '/api/pinion',
  unwrapPreset: 'pinoox',
  parallel: 2,
  onProgress: ({ percent }) => bar.style.width = percent + '%',
});
```

Skip Pinion for small files and fall back to a normal POST:

```javascript
const skipped = await uploadFile(file, {
  baseURL: '/api/pinion',
  auto: true,
  threshold: 8 * 1024 * 1024,
});

if (skipped === null) {
  // file is below threshold — use a regular upload
}
```

With Axios (legacy signature):

```javascript
import axios from 'axios';
import { uploadFile } from '@pinooxhq/pinion-client';

await uploadFile(axios, file, { baseURL: '/api/pinion', unwrapPreset: 'pinoox' });
```

### 2 — Fluent API (reusable)

Create one uploader, use it for many files.

```javascript
import { pinion } from '@pinooxhq/pinion-client';

const uploader = pinion({
  baseURL: '/app/pinion',
  unwrapPreset: 'pinoox',
  headers: { Authorization: 'Bearer …' },
});

if (!uploader.for(file).needsPinion()) {
  return fallbackUpload(file);
}

await uploader.for(file).upload({ parallel: 2, retry: 2 });
```

### 3 — Full client (batch + hooks)

Maximum control — progress hooks, batch uploads, cancel.

```javascript
import { createPinionFetch } from '@pinooxhq/pinion-client';

const client = createPinionFetch({
  baseURL: '/api/pinion',
  unwrapPreset: 'pinoox',
  destination: 'uploads/media',
  extensions: ['mp4', 'zip', 'pdf'],
});

await client.upload(file, {
  onProgress: ({ percent, bytesUploaded, bytesTotal, speed, eta }) => {
    console.log(`${percent}% · ${speed} B/s · ETA ${eta}s`);
  },
  onChunkStart: (i) => console.log('part', i),
  onError: (err, i) => console.warn(err.code, i),
});

await client.uploadMany([file1, file2], {
  fileParallel: 1,
  onFileStart: (f, i) => console.log('file', i, f.name),
  onFileComplete: (f, result, i) => console.log('done', i),
});

client.cancel();
```

### 4 — Low-level steps (manual)

Call each HTTP step yourself — useful for custom UI or non-file sources.

```javascript
import { createPinionFetch, sha256Hex } from '@pinooxhq/pinion-client';

const client = createPinionFetch({ baseURL: '/api/pinion', unwrapPreset: 'pinoox' });

const session = await client.api.init({
  filename: file.name,
  size: file.size,
  fingerprint: client.buildFingerprint(file),
});

const blob = file.slice(0, session.chunk_size);
const form = new FormData();
form.append('upload_id', session.id);
form.append('index', '0');
form.append('chunk_hash', await sha256Hex(blob));
form.append('chunk', blob);

await client.api.uploadPart(form);
await client.api.complete(session.id);
```

### 5 — With Axios (optional)

Use Axios when you need per-chunk `onUploadProgress` or already have an Axios instance.

```javascript
import axios from 'axios';
import { pinion, createPinionAxios } from '@pinooxhq/pinion-client';

// shortcut
const uploader = pinion(axios, { baseURL: '/api/pinion', unwrapPreset: 'pinoox' });

await uploader.for(file).upload({
  onProgress: ({ percent }) => console.log(percent),
  onUploadProgress: (event, index) => console.log('part', index, event.loaded),
});

// or get both axios instance + client
const { axios: http, client } = createPinionAxios(axios, {
  baseURL: '/api/pinion',
  unwrapPreset: 'pinoox',
  axiosConfig: { timeout: 120000 },
});
```

### 6 — Custom transport

Plug in your own HTTP layer by implementing `get`, `postJson`, `postForm`.

```javascript
import { createPinionClient, createFetchTransport } from '@pinooxhq/pinion-client';

const transport = createFetchTransport({
  baseURL: '/api/pinion',
  fetch: myFetch,
  unwrap: (res) => res.data,
  headers: { 'X-App': 'portal' },
});

const client = createPinionClient({ transport });
```

---

## Transport

| Mode | How | Notes |
|------|-----|-------|
| **fetch** (default) | `pinion({ baseURL })` · `createPinionFetch()` · `uploadFile(file, …)` | Zero extra deps |
| **Axios** | `pinion(axios, …)` · `createPinionClient(axiosInstance, …)` | `onUploadProgress` per chunk |
| **Custom** | `createPinionClient({ transport })` | Full control |

Check active mode: `client.transport.kind` → `'fetch'` or `'axios'`.

---

## Framework patterns

### Vue 3

```javascript
import { ref } from 'vue';
import { pinion } from '@pinooxhq/pinion-client';

const percent = ref(0);
const uploader = pinion({ baseURL: '/app/pinion', unwrapPreset: 'pinoox' });

async function onPick(file) {
  percent.value = 0;
  await uploader.for(file).upload({
    parallel: 2,
    onProgress: (p) => { percent.value = p.percent; },
  });
}
```

### React

```javascript
import { useState, useMemo } from 'react';
import { createPinionFetch } from '@pinooxhq/pinion-client';

export function usePinion(baseURL = '/api/pinion') {
  const client = useMemo(
    () => createPinionFetch({ baseURL, unwrapPreset: 'pinoox' }),
    [baseURL],
  );
  const [progress, setProgress] = useState(0);

  const upload = (file) => client.for(file).upload({
    onProgress: (p) => setProgress(p.percent),
  });

  return { upload, progress, cancel: () => client.cancel() };
}
```

---

## Advanced

### Unwrap presets

Map your backend JSON envelope without custom code.

| Preset | Returns |
|--------|---------|
| `pinoox` | `res.data.data` |
| `laravel` | same envelope |
| `flat` | `res.data` |
| `raw` | full response object |

```javascript
import { createPinionClient, unwrapPresets } from '@pinooxhq/pinion-client';

createPinionClient({ baseURL: '/api/pinion', unwrapPreset: 'pinoox' });

createPinionClient({
  baseURL: '/api/pinion',
  unwrap: (res) => res.data.result,
});

unwrapPresets.pinoox(response);
```

### Cancel upload

```javascript
const controller = new AbortController();
uploader.for(file).upload({ signal: controller.signal });
controller.abort();

// or
uploader.cancel();
```

---

## HTTP rules

| Step | Content-Type | Body |
|------|--------------|------|
| `init`, `complete`, `abort` | `application/json` | plain object |
| `upload` | *(auto)* | `FormData` — **never** set `multipart/form-data` manually |

---

## API reference

### Factories

| Function | Description |
|----------|-------------|
| `uploadFile(file, options?)` | One-shot upload (fetch) |
| `uploadFile(axios, file, options?)` | One-shot upload (Axios) |
| `pinion(options?)` | Fluent client (fetch) |
| `pinion(axios, options?)` | Fluent client (Axios) |
| `createPinionFetch(options?)` | Explicit fetch client |
| `createPinionAxios(axios, options?)` | `{ axios, client }` |
| `createPinionClient(options?)` | Full client (fetch) |
| `createPinionClient(axios, options?)` | Full client (Axios) |

### Client options

| Option | Default | Description |
|--------|---------|-------------|
| `baseURL` | `/api/pinion` | Pinion HTTP root |
| `fetch` | `globalThis.fetch` | Custom fetch (Node polyfill, etc.) |
| `transport` | auto | Custom `PinionTransport` |
| `unwrapPreset` | — | `pinoox` \| `laravel` \| `flat` \| `raw` |
| `unwrap` | auto | Custom response mapper |
| `storageKey` | `pinion_sessions` | Resume cache key |
| `storage` | localStorage / memory | Custom adapter |
| `headers` | `{}` | Default request headers |
| `destination` | — | Default server folder |
| `extensions` | — | Allowed file extensions |
| `threshold` | 8 MB | `shouldUsePinion` limit |

### Upload options

| Option | Default | Description |
|--------|---------|-------------|
| `parallel` | `2` | Concurrent parts |
| `retry` | `2` | Retries per part |
| `retryDelayMs` | `800` | Backoff base |
| `chunkSize` | server | Requested part size |
| `fileHash` | — | Whole-file hash on complete |
| `meta` | `{}` | Custom init metadata |
| `signal` | — | `AbortSignal` |
| `onProgress` | — | `{ percent, bytesUploaded, bytesTotal, chunkIndex, speed, eta }` |
| `onUploadProgress` | — | Raw Axios event per part (**Axios only**) |

### Client methods

| Method | Description |
|--------|-------------|
| `client.for(file)` | Fluent handle |
| `client.upload(file)` | Full upload flow |
| `client.resume(file)` | Same as upload |
| `client.uploadMany(files)` | Batch upload |
| `client.cancel()` | Abort active upload |
| `client.api.*` | Low-level HTTP steps |
| `client.transport` | Active transport (`kind`: `fetch` \| `axios`) |
| `client.getStoredSession(fp)` | Read resume cache |

### Transport helpers

| Export | Description |
|--------|-------------|
| `createFetchTransport()` | Build fetch transport |
| `createAxiosTransport()` | Build Axios transport |
| `isAxiosInstance()` | Detect Axios instance |
| `isPinionTransport()` | Detect custom transport |

---

## Publish to npm

### Prerequisites

| Item | Notes |
|------|-------|
| [npmjs.com](https://www.npmjs.com) account | Email verified |
| `@pinooxhq` org | Required for scoped package |
| Node.js 18+ | `node -v` |

### Steps

```bash
cd packages/pinion/client
npm pack                    # verify tarball
npm login
npm version minor -m "chore: release v%s"
npm publish --access public
```

Verify:

```bash
mkdir /tmp/pinion-test && cd /tmp/pinion-test
npm init -y
npm install @pinooxhq/pinion-client
```

```javascript
import { pinion, PROTOCOL } from '@pinooxhq/pinion-client';
console.log(PROTOCOL); // pinion
```

### CI (optional)

```yaml
name: Publish npm
on:
  release:
    types: [published]
jobs:
  publish:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: client
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

| Layer | Registry | Package |
|-------|----------|---------|
| Server (PHP) | Packagist | `pinoox/pinion` |
| Browser (JS) | npm | `@pinooxhq/pinion-client` |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `PINION_NO_FETCH` | Pass `options.fetch` or use Axios |
| `402 Payment Required` | Add `--access public` on publish |
| `403 Forbidden` | Check org membership or token |
| `403 cannot publish over` | Bump version: `npm version patch` |
| Multipart fails | Do not set `Content-Type` on `FormData` |
| `PINION_INIT_FAILED` | Set `unwrapPreset` or custom `unwrap` |
| Progress stuck | Check `missing_indexes` via `client.api.status(id)` |

---

## License

MIT — [Pinoox](https://www.pinoox.com)

PHP protocol: [pinoox/pinion](https://github.com/pinoox/pinion)
