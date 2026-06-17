# @pinooxhq/pinion-client

Axios client for the **[Pinion](https://github.com/pinoox/pinion)** resumable upload protocol.

```bash
npm install @pinooxhq/pinion-client axios
```

```javascript
import axios from 'axios';
import { pinion } from '@pinooxhq/pinion-client';

const uploader = pinion(axios, { baseURL: '/api/pinion', unwrapPreset: 'pinoox' });

await uploader.for(file).upload({
  onProgress: ({ percent, speed, eta }) => console.log(percent, speed, eta),
});
```

---

## Table of contents

- [Features](#features)
- [Install](#install)
- [Usage levels](#usage-levels)
  - [Level 1 — one function](#level-1--one-function)
  - [Level 2 — fluent API](#level-2--fluent-api)
  - [Level 3 — full client](#level-3--full-client)
  - [Level 4 — low-level API](#level-4--low-level-api)
- [Advanced](#advanced)
- [API reference](#api-reference)
- [Publish to npm](#publish-to-npm)
- [After publishing](#after-publishing)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

| Feature | Description |
|---------|-------------|
| Resume | `fingerprint` + `localStorage` session cache |
| Parallel parts | Upload multiple chunks at once (default `2`) |
| Retry | Auto-retry failed parts with backoff |
| Checksums | SHA-256 `chunk_hash` per part |
| Progress | `percent`, `bytes`, `speed`, `eta` |
| Axios progress | `onUploadProgress` per chunk |
| Unwrap presets | `pinoox`, `laravel`, `flat`, `raw` |
| Batch upload | `uploadMany()` for multiple files |
| TypeScript | Full `.d.ts` included |
| Cancel | `AbortSignal` or `client.cancel()` |

---

## Install

```bash
npm install @pinooxhq/pinion-client axios
```

```bash
yarn add @pinooxhq/pinion-client axios
pnpm add @pinooxhq/pinion-client axios
```

---

## Usage levels

Pick the style that fits your project.

### Level 1 — one function

Best for a single upload button.

```javascript
import axios from 'axios';
import { uploadFile } from '@pinooxhq/pinion-client';

const result = await uploadFile(axios, file, {
  baseURL: '/api/pinion',
  unwrapPreset: 'pinoox',
  parallel: 2,
  onProgress: ({ percent }) => bar.style.width = percent + '%',
});

// auto: skip Pinion for small files
const skipped = await uploadFile(axios, file, {
  baseURL: '/api/pinion',
  auto: true,
  threshold: 8 * 1024 * 1024,
});
if (skipped === null) {
  // use normal single POST upload
}
```

### Level 2 — fluent API

Readable chain-style API.

```javascript
import axios from 'axios';
import { pinion } from '@pinooxhq/pinion-client';

const uploader = pinion(axios, {
  baseURL: '/app/pinion',
  unwrapPreset: 'pinoox',
  headers: { Authorization: 'Bearer …' },
});

if (!uploader.for(file).needsPinion()) {
  return fallbackUpload(file);
}

const result = await uploader
  .for(file)
  .upload({ parallel: 2, retry: 2 });
```

### Level 3 — full client

Full control + batch uploads.

```javascript
import axios from 'axios';
import { createPinionAxios } from '@pinooxhq/pinion-client';

const { client } = createPinionAxios(axios, {
  baseURL: '/api/pinion',
  unwrapPreset: 'pinoox',
  destination: 'uploads/media',
  extensions: ['mp4', 'zip', 'pdf'],
  axiosConfig: { timeout: 120000 },
});

// single file
await client.upload(file, {
  onProgress: ({ percent, bytesUploaded, bytesTotal, speed, eta }) => {
    console.log(`${percent}% · ${speed} B/s · ETA ${eta}s`);
  },
  onChunkStart: (i) => console.log('part', i),
  onError: (err, i) => console.warn(err.code, i),
});

// multiple files
await client.uploadMany([file1, file2], {
  fileParallel: 1,
  onFileStart: (f, i) => console.log('file', i, f.name),
  onFileComplete: (f, result, i) => console.log('done', i),
});

// cancel
client.cancel();
```

### Level 4 — low-level API

Manual step control.

```javascript
import { sha256Hex } from '@pinooxhq/pinion-client';

const session = await client.api.init({
  filename: 'course-video.mp4',
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

---

## Advanced

### Unwrap presets

Map your backend JSON shape without custom code.

```javascript
import { createPinionClient, unwrapPresets } from '@pinooxhq/pinion-client';

// preset shorthand
createPinionClient(axios, { unwrapPreset: 'pinoox' });  // res.data.data
createPinionClient(axios, { unwrapPreset: 'laravel' }); // same envelope
createPinionClient(axios, { unwrapPreset: 'flat' });    // res.data
createPinionClient(axios, { unwrapPreset: 'raw' });     // full Axios response

// custom
createPinionClient(axios, {
  unwrap: (res) => res.data.result,
});

// or use preset directly
unwrapPresets.pinoox(response);
```

### Vue 3 composable pattern

```javascript
import { ref } from 'vue';
import axios from 'axios';
import { pinion } from '@pinooxhq/pinion-client';

const percent = ref(0);
const eta = ref(null);
const uploader = pinion(axios, { baseURL: '/app/pinion', unwrapPreset: 'pinoox' });

async function onPick(file) {
  percent.value = 0;
  await uploader.for(file).upload({
    parallel: 2,
    onProgress: (p) => {
      percent.value = p.percent;
      eta.value = p.eta;
    },
  });
}
```

### React hook pattern

```javascript
import { useState, useMemo } from 'react';
import axios from 'axios';
import { createPinionAxios } from '@pinooxhq/pinion-client';

export function usePinion(baseURL = '/api/pinion') {
  const { client } = useMemo(
    () => createPinionAxios(axios, { baseURL, unwrapPreset: 'pinoox' }),
    [baseURL],
  );
  const [progress, setProgress] = useState(0);

  const upload = (file) => client.for(file).upload({
    onProgress: (p) => setProgress(p.percent),
  });

  return { upload, progress, cancel: () => client.cancel() };
}
```

### Cancel upload

```javascript
const controller = new AbortController();
uploader.for(file).upload({ signal: controller.signal });
controller.abort();

// or
uploader.cancel();
```

### Axios rules

| Step | Content-Type | Body |
|------|--------------|------|
| `init`, `complete`, `abort` | `application/json` | plain object |
| `upload` | *(auto)* | `FormData` — **never** set `multipart/form-data` manually |

---

## API reference

### `pinion(axios, options?)`

Shortcut → `createPinionAxios(axios, options).client`

### `uploadFile(axios, file, options?)`

One-shot upload. Returns `null` when `auto: true` and file is below `threshold`.

### `createPinionAxios(axios, options?)`

Returns `{ axios, client }`.

### `createPinionClient(axios, options?)`

| Option | Default | Description |
|--------|---------|-------------|
| `baseURL` | `/api/pinion` | Pinion HTTP root |
| `unwrapPreset` | — | `pinoox` \| `laravel` \| `flat` \| `raw` |
| `unwrap` | auto | Custom response mapper |
| `storageKey` | `pinion_sessions` | Resume cache key |
| `storage` | localStorage / memory | Custom adapter |
| `headers` | `{}` | Default request headers |
| `destination` | — | Default server folder |
| `extensions` | — | Allowed file extensions |
| `threshold` | 8 MB | `shouldUsePinion` limit |

### `client.upload(file, options?)`

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
| `onUploadProgress` | — | Raw Axios event per part |

### Client methods

| Method | Description |
|--------|-------------|
| `client.for(file)` | Fluent handle |
| `client.upload(file)` | Full upload flow |
| `client.resume(file)` | Same as upload |
| `client.uploadMany(files)` | Batch upload |
| `client.cancel()` | Abort active upload |
| `client.api.*` | Low-level HTTP steps |
| `client.getStoredSession(fp)` | Read resume cache |

---

## Publish to npm

### Prerequisites

| Item | Notes |
|------|-------|
| [npmjs.com](https://www.npmjs.com) account | Email verified |
| `@pinooxhq` org | Required for scoped package (or use unscoped name) |
| Node.js 18+ | `node -v` |

### Step 1 — prepare

```bash
cd packages/pinion/client
npm pack
```

Verify tarball contents before publishing.

### Step 2 — login

```bash
npm login
npm whoami
```

### Step 3 — version

```bash
npm version minor -m "chore: release v%s"
```

SemVer: `patch` = bugfix · `minor` = feature · `major` = breaking.

### Step 4 — publish

```bash
npm publish --access public
```

Scoped packages always need `--access public` on the free plan.

### Step 5 — verify install

```bash
mkdir /tmp/pinion-test && cd /tmp/pinion-test
npm init -y
npm install @pinooxhq/pinion-client axios
```

```javascript
import { pinion, PROTOCOL } from '@pinooxhq/pinion-client';
console.log(PROTOCOL); // pinion
```

### Step 6 — CI (optional)

`.github/workflows/publish-npm.yml`:

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

Create **NPM_TOKEN** (Publish) in npm → Access Tokens → GitHub Secrets.

### Monorepo publish

Publish from `client/` folder only. `package.json` already sets:

```json
"repository": {
  "directory": "client"
}
```

---

## After publishing

| Layer | Registry | Package |
|-------|----------|---------|
| Server (PHP) | Packagist | `pinoox/pinion` |
| Browser (JS) | npm | `@pinooxhq/pinion-client` |

```bash
# Vue / Vite / React
npm install @pinooxhq/pinion-client axios
```

```javascript
import { pinion } from '@pinooxhq/pinion-client';
import axios from 'axios';

const uploader = pinion(axios, { baseURL: '/app/pinion', unwrapPreset: 'pinoox' });
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `402 Payment Required` | Add `--access public` |
| `403 Forbidden` | Check org membership or token |
| `403 cannot publish over` | Bump version: `npm version patch` |
| Multipart fails | Do not set `Content-Type` on `FormData` |
| `PINION_INIT_FAILED` | Set `unwrapPreset` or custom `unwrap` |
| Progress stuck | Check `missing_indexes` via `client.api.status(id)` |

---

## License

MIT — [Pinoox](https://www.pinoox.com)

PHP protocol: [pinoox/pinion](https://github.com/pinoox/pinion)
