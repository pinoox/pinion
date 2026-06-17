# Pinion — Resumable Upload Protocol for PHP

**Pinion** (`pinoox/pinion`) uploads large files in small parts on hosts with low `upload_max_filesize` / `post_max_size`.  
Protocol id: `pinion` · version: `2` · PHP 8.1+

---

## Structure

```
packages/pinion/
├── client/
│   ├── pinion-axios.js   # Browser client (Axios)
│   └── package.json
├── config/pinion.php
├── src/                  # PHP protocol engine
├── tests/
└── README.md
```

## Table of contents

- [Quick start](#quick-start)
- [Use cases](#use-cases)
- [Install](#install)
- [Entry points & API surface](#entry-points--api-surface)
- [Configuration](#configuration)
- [HTTP protocol](#http-protocol)
- [Usage — Plain PHP](#usage--plain-php)
- [Usage — Pinoox](#usage--pinoox)
- [Usage — Laravel](#usage--laravel)
- [JavaScript & Axios client](#javascript--axios-client)
- [License](#license)

---

## Quick start

```bash
composer require pinoox/pinion
```

```php
use Pinoox\Pinion\Pinion;

Pinion::configure(['storage_path' => '/tmp/pinion']);

$result = Pinion::begin()
    ->filename('course-video.mp4')
    ->size(524288000)
    ->to('uploads/videos')
    ->init();

$uploadId = $result->session->id;

Pinion::manager()->receive($uploadId, 0, $chunkBinary, $chunkHash);
$done = Pinion::manager()->complete($uploadId);

echo $done->path; // final file path
```

Wire HTTP in three lines:

```php
$handler = Pinion::http(['destination' => 'uploads/videos']);
$response = $handler->init($_POST);           // POST /init
$response = $handler->upload($_POST, $file);  // POST /upload
$response = $handler->complete($_POST);       // POST /complete
```

That is the whole idea: **init → upload parts → complete**.

---

## Use cases

| Scenario | Why Pinion |
|----------|------------|
| Shared hosting (20 MB upload cap) | Send 5 MB parts instead of one huge POST |
| Slow or mobile networks | Resume after disconnect via `fingerprint` |
| Video / archive uploads | Hundreds of MB or GB without raising `php.ini` limits |
| Admin panels & CMS | Background progress bar with parallel parts |
| API file intake | Stable contract (`pinion` v2) across PHP stacks |
| Integrity-sensitive files | SHA-256 per part (`chunk_hash`) and optional whole-file hash |

Pinion does **not** replace object storage (S3, MinIO). It solves the **PHP request size** problem and assembles the file on your server disk.

---

## Install

```bash
composer require pinoox/pinion
```

**Pinoox monorepo** (local path):

```json
{
  "repositories": [{"type": "path", "url": "packages/pinion"}],
  "require": {"pinoox/pinion": "@dev"}
}
```

---

## Entry points & API surface

| Class / method | Role |
|----------------|------|
| `Pinion::configure($config, $pathResolver?)` | Boot once — config + optional path resolver |
| `Pinion::manager()` | Low-level `Manager` instance |
| `Pinion::begin()` | Fluent `Builder` for `init()` |
| `Pinion::http($defaults)` | Framework-agnostic HTTP adapter (returns arrays) |
| `Manager::init(...)` | Create or resume session |
| `Manager::receive(...)` | Store one part |
| `Manager::complete(...)` | Assemble final file |
| `Manager::status(...)` | Progress + `missing_indexes` |
| `Manager::abort(...)` | Cancel session |
| `Manager::list(...)` | List sessions by status |
| `Manager::cleanExpired()` | Purge expired pending sessions |
| `HttpHandler` | Maps HTTP input → Manager → `{ success, data?, error? }` |
| `Builder` | `filename()`, `size()`, `to()`, `extensions()`, `fingerprint()`, `chunkSize()`, `init()` |
| `Session` | Read-only upload state + `missingIndexes()`, `progress()` |
| `Result` | `success`, `session`, `path`, `error`, `resumed` |
| `PathResolverInterface` | Map logical destination → absolute directory |

**JavaScript client** (`client/pinion-axios.js`):

| Export | Role |
|--------|------|
| `createPinionClient(axios, options)` | Full upload helper (resume, progress, parallel) |
| `buildFingerprint(file)` | Stable client-side session key |
| `shouldUsePinion(file, threshold?)` | Skip Pinion for small files |
| `client.upload(file, opts)` | `init → upload parts → complete` |
| `client.api` | Low-level `init`, `uploadPart`, `complete`, `status`, `abort` |

**Laravel extras** (auto-discovery):

| Piece | Role |
|-------|------|
| `PinionServiceProvider` | Registers `Manager` + `HttpHandler` singletons |
| `Pinion` facade | `Pinion::begin()`, `Pinion::http()` |

**Pinoox extras** (in `pincore`, not this package):

| Piece | Role |
|-------|------|
| `Pinoox\Portal\Pinion` | Static portal over `Manager` |
| `Pinoox\Component\Pinion\HttpHandler` | Wraps package handler → `JsonResponse` |
| CLI | `php pinoox pinion:list`, `pinion:info`, `pinion:clean` |

---

## Configuration

Pass an array to `Pinion::configure()` or copy `config/pinion.php`.

| Key | Default | Description |
|-----|---------|-------------|
| `protocol` | `pinion` | Protocol identifier (read-only in responses) |
| `protocol_version` | `2` | Protocol version |
| `chunk_size` | `5242880` (5 MB) | Part size in bytes |
| `min_chunk_size` | `1048576` (1 MB) | Lower clamp |
| `max_chunk_size` | `10485760` (10 MB) | Upper clamp |
| `ttl` | `86400` | Session lifetime (seconds) |
| `max_file_size` | `2147483648` (2 GB) | Max declared file size |
| `storage_path` | `/tmp/pinion` | Temp workspace for in-progress uploads |
| `storage_strategy` | `parts` | `parts` or `sparse` |
| `verify_chunks` | `true` | Require matching `chunk_hash` (SHA-256) |
| `verify_file_hash` | `false` | Require `file_hash` on complete |

**Laravel / `.env` example:**

```env
PINION_CHUNK_SIZE=5242880
PINION_TTL=86400
PINION_MAX_FILE=2147483648
PINION_PATH=/var/www/storage/pinion-temp
PINION_STRATEGY=parts
PINION_VERIFY_CHUNKS=true
PINION_VERIFY_FILE=false
```

### Storage strategies

| Strategy | On disk | Best for |
|----------|---------|----------|
| `parts` | `{id}/parts/0.part`, `1.part`, … | Parallel client uploads |
| `sparse` | Single `{id}/blob.part` with offset writes | Fewer files, sequential writes |

### Custom destinations

By default `NativePathResolver` resolves `to('uploads/videos')` relative to a base path you pass at configure time. For multi-root apps implement `PathResolverInterface`:

```php
final class AppPathResolver implements PathResolverInterface
{
    public function resolve(string $reference): string
    {
        return match ($reference) {
            'videos' => '/data/media/videos',
            'documents' => '/data/media/docs',
            default => '/data/media/' . ltrim($reference, '/'),
        };
    }
}
```

---

## HTTP protocol

Expose five endpoints in your router. Field names are stable.

| Step | Endpoint | Input |
|------|----------|-------|
| Init / resume | `POST /init` | `filename`, `size`, `destination`, optional `fingerprint`, `chunk_size`, `mime`, `file_hash`, `extensions`, `meta` |
| Upload part | `POST /upload` | `upload_id`, `index`, `chunk` (file), optional `chunk_hash` |
| Complete | `POST /complete` | `upload_id`, optional `file_hash` |
| Status | `GET /status/{upload_id}` | — |
| Abort | `POST /abort/{upload_id}` | — |

**Init response (excerpt):**

```json
{
  "id": "a1b2c3d4-e5f6-4789-a012-3456789abcde",
  "filename": "backup-2026.zip",
  "size": 524288000,
  "chunk_size": 5242880,
  "total_chunks": 100,
  "missing_indexes": [0, 1, 2],
  "protocol": "pinion",
  "protocol_version": 2,
  "resumable": true
}
```

Same `fingerprint` → existing session returned with `resumed: true`.

**Error envelope (`HttpHandler`):**

```json
{
  "success": false,
  "status": 400,
  "error": {
    "code": "PINION_INVALID",
    "message": "invalid_chunk_request",
    "details": {}
  }
}
```

### Client flow (browser / mobile)

1. Build `fingerprint` from `name:size:lastModified:type`.
2. `POST /init` → get `upload_id` and `missing_indexes`.
3. For each index: slice file, SHA-256 → `POST /upload`.
4. Optional parallel uploads (`parallel=2`).
5. `POST /complete`.
6. Keep `upload_id` in `localStorage` until done (resume support).

---

## Usage — Plain PHP

Full programmatic flow without a framework.

```php
use Pinoox\Pinion\Pinion;
use Pinoox\Pinion\Support\NativePathResolver;

Pinion::configure([
    'storage_path' => '/var/www/storage/pinion-temp',
    'chunk_size' => 5 * 1024 * 1024,
    'verify_chunks' => true,
], new NativePathResolver('/var/www'));

// 1. Init
$result = Pinion::begin()
    ->filename('report-Q1.pdf')
    ->size(48_000_000)
    ->to('uploads/documents')
    ->extensions(['pdf'])
    ->fingerprint($clientFingerprint)
    ->chunkSize('5MB')
    ->init();

if (!$result->success) {
    exit($result->error);
}

$uploadId = $result->session->id;

// 2. Receive parts (repeat per index)
foreach ($missingIndexes as $index) {
    Pinion::manager()->receive($uploadId, $index, $chunkBinary, $chunkHash);
}

// 3. Complete
$complete = Pinion::manager()->complete($uploadId);
// $complete->path → /var/www/uploads/documents/report-Q1.pdf
```

Single-file HTTP endpoint:

```php
use Pinoox\Pinion\Pinion;

Pinion::configure(require __DIR__ . '/pinion.config.php');

$handler = Pinion::http([
    'destination' => 'uploads/inbox',
    'extensions' => ['zip', 'pdf', 'mp4'],
]);

$action = $_GET['action'] ?? '';

$response = match ($action) {
    'init' => $handler->init($_POST),
    'upload' => $handler->upload($_POST, $_FILES['chunk'] ?? null),
    'complete' => $handler->complete($_POST),
    'status' => $handler->status((string) ($_GET['upload_id'] ?? '')),
    'abort' => $handler->abort((string) ($_GET['upload_id'] ?? '')),
    default => ['success' => false, 'error' => ['code' => 'PINION_UNKNOWN', 'message' => 'unknown_action']],
};

header('Content-Type: application/json');
echo json_encode($response);
```

Maintenance helpers:

```php
$session = Pinion::manager()->status($uploadId);
$pending = Pinion::manager()->list('pending');
$removed = Pinion::manager()->cleanExpired();
Pinion::manager()->abort($uploadId);
```

---

## Usage — Pinoox

Inside a Pinoox project, use the **Portal** and the core HTTP bridge — do not wire the package manually.

```php
use Pinoox\Portal\Pinion;
use Pinoox\Component\Http\Request;

// Programmatic
$result = Pinion::begin()
    ->filename('backup-2026.zip')
    ->size(524288000)
    ->to('downloads/archives')
    ->extensions(['zip', 'tar', 'gz'])
    ->fingerprint($clientFingerprint)
    ->init();

Pinion::receive($result->session->id, 0, $chunkBinary, $chunkHash);
$complete = Pinion::complete($result->session->id);
```

Controller with JSON responses:

```php
use Pinoox\Component\Http\Request;
use Pinoox\Portal\Pinion;

class MediaUploadController extends ApiController
{
    private function pinion()
    {
        return Pinion::http([
            'destination' => 'uploads/media',
            'extensions' => ['mp4', 'mov', 'webm'],
        ]);
    }

    public function init(Request $request)    { return $this->pinion()->init($request); }
    public function upload(Request $request)  { return $this->pinion()->upload($request); }
    public function complete(Request $request){ return $this->pinion()->complete($request); }
    public function status(string $uploadId)  { return $this->pinion()->status($uploadId); }
    public function abort(string $uploadId)   { return $this->pinion()->abort($uploadId); }
}
```

Config: `pincore/config/pinion.config.php` · storage alias: `pinion_uploads` → `storage/pinion`

CLI:

```bash
php pinoox pinion:list
php pinoox pinion:info {upload_id}
php pinoox pinion:clean --abort={upload_id}
```

More detail: [Pinoox Pinion guide](../docs/en/advanced/pinion.md)

---

## Usage — Laravel

Laravel 10+ via package auto-discovery.

**1. Publish config**

```bash
php artisan vendor:publish --tag=pinion-config
```

```php
// config/pinion.php
return [
    'storage_path' => storage_path('app/pinion'),
    'chunk_size' => 5 * 1024 * 1024,
    'verify_chunks' => true,
    'defaults' => [
        'destination' => 'uploads',
        'extensions' => ['mp4', 'zip', 'pdf'],
    ],
];
```

**2. Routes**

```php
// routes/api.php
use App\Http\Controllers\PinionUploadController;

Route::prefix('pinion')->group(function () {
    Route::post('init', [PinionUploadController::class, 'init']);
    Route::post('upload', [PinionUploadController::class, 'upload']);
    Route::post('complete', [PinionUploadController::class, 'complete']);
    Route::get('status/{uploadId}', [PinionUploadController::class, 'status']);
    Route::post('abort/{uploadId}', [PinionUploadController::class, 'abort']);
});
```

**3. Controller** (inject `HttpHandler` from the container)

```php
namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Pinoox\Pinion\HttpHandler;

final class PinionUploadController extends Controller
{
    public function __construct(private readonly HttpHandler $pinion) {}

    public function init(Request $request): JsonResponse
    {
        return $this->json($this->pinion->init($request->all()));
    }

    public function upload(Request $request): JsonResponse
    {
        return $this->json($this->pinion->upload($request->all(), $request->file('chunk')));
    }

    public function complete(Request $request): JsonResponse
    {
        return $this->json($this->pinion->complete($request->all()));
    }

    public function status(string $uploadId): JsonResponse
    {
        return $this->json($this->pinion->status($uploadId));
    }

    public function abort(string $uploadId): JsonResponse
    {
        return $this->json($this->pinion->abort($uploadId));
    }

    private function json(array $payload): JsonResponse
    {
        $status = (int) ($payload['status'] ?? ($payload['success'] ? 200 : 400));

        return response()->json(
            $payload['success'] ? ($payload['data'] ?? null) : ($payload['error'] ?? $payload),
            $status,
        );
    }
}
```

**4. Facade** (optional, server-side jobs)

```php
use Pinoox\Pinion\Laravel\Facades\Pinion;

$result = Pinion::begin()
    ->filename('dataset-export.csv')
    ->size(filesize($path))
    ->to('exports')
    ->init();
```

---

## JavaScript & Axios client

Pinion ships a browser helper at `client/pinion-axios.js`. It works with **Axios 1.x** and unwraps common API envelopes (`{ data: … }` from Pinoox / Laravel).

### Install (frontend)

```bash
npm install axios
```

Copy or import the client from the package:

```javascript
import axios from 'axios';
import { createPinionClient } from './vendor/pinoox/pinion/client/pinion-axios.js';
// or: import { createPinionClient } from '@pinoox/pinion-client';
```

### Quick upload (Axios)

```javascript
import axios from 'axios';
import { createPinionClient } from 'pinoox/pinion/client/pinion-axios.js';

const api = axios.create({
    baseURL: '/api',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

const pinion = createPinionClient(api, { baseURL: '/api/pinion' });

const input = document.querySelector('#file');
input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!pinion.shouldUsePinion(file)) return;

    const result = await pinion.upload(file, {
        parallel: 2,
        onProgress: (percent) => console.log(percent + '%'),
    });

    console.log('done', result);
});
```

### Vue / React pattern

```javascript
import { ref } from 'vue';
import axios from 'axios';
import { createPinionClient, shouldUsePinion } from 'pinoox/pinion/client/pinion-axios.js';

const progress = ref(0);
const controller = new AbortController();

const pinion = createPinionClient(axios, {
    baseURL: '/app/pinion',
    // Pinoox ApiResponse: { data: { … } }
    unwrap: (res) => res.data?.data ?? res.data,
});

async function onFileSelected(file) {
    if (!shouldUsePinion(file)) {
        // fall back to normal single POST upload
        return;
    }

    progress.value = 0;
    await pinion.upload(file, {
        parallel: 2,
        signal: controller.signal,
        onProgress: (p) => { progress.value = p; },
    });
}

function cancel() {
    controller.abort();
}
```

### Low-level Axios API

Use `client.api` when you control each step yourself:

```javascript
const pinion = createPinionClient(axios, { baseURL: '/api/pinion' });

// JSON body
const session = await pinion.api.init({
    filename: 'course-video.mp4',
    size: file.size,
    fingerprint: pinion.buildFingerprint(file),
});

// multipart — do NOT set Content-Type; Axios adds the boundary
const form = new FormData();
form.append('upload_id', session.id);
form.append('index', '0');
form.append('chunk_hash', await sha256Hex(blob));
form.append('chunk', blob, 'course-video.mp4.part');

await pinion.api.uploadPart(form);

await pinion.api.complete(session.id);
await pinion.api.status(session.id);
await pinion.api.abort(session.id);
```

### Axios rules for Pinion

| Request | Content-Type | Body |
|---------|--------------|------|
| `init`, `complete`, `abort` | `application/json` | plain object |
| `upload` | *(auto)* | `FormData` with `chunk` field |

**Do not** set `Content-Type: multipart/form-data` manually on upload — Axios must set the boundary.

**Do** pass `signal` from `AbortController` to cancel in-flight parts:

```javascript
const controller = new AbortController();
pinion.upload(file, { signal: controller.signal });
// later: controller.abort();
```

### Custom response unwrap

If your API returns a different envelope:

```javascript
const pinion = createPinionClient(axios, {
    baseURL: '/api/pinion',
    unwrap: (response) => response.data.result,
});
```

### Fetch (without Axios)

```javascript
async function sha256Hex(blob) {
    const buffer = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function uploadLargeFile(file, baseUrl = '/api/pinion') {
    const fingerprint = [file.name, file.size, file.lastModified, file.type].join(':');

    const init = await fetch(`${baseUrl}/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, size: file.size, fingerprint }),
    }).then(r => r.json());

    const session = init.session ?? init.data ?? init;
    const chunkSize = session.chunk_size;
    const indexes = session.missing_indexes ?? Array.from({ length: session.total_chunks }, (_, i) => i);

    for (const index of indexes) {
        const start = index * chunkSize;
        const blob = file.slice(start, start + chunkSize);
        const form = new FormData();
        form.append('upload_id', session.id);
        form.append('index', String(index));
        form.append('chunk_hash', await sha256Hex(blob));
        form.append('chunk', blob, `${file.name}.part`);
        await fetch(`${baseUrl}/upload`, { method: 'POST', body: form });
    }

    return fetch(`${baseUrl}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: session.id }),
    }).then(r => r.json());
}
```

---

## License

MIT — [Pinoox](https://www.pinoox.com)
