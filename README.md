# Pinion — Resumable Upload Protocol for PHP

**Pinion** (`pinoox/pinion`) uploads large files in small parts on hosts with low `upload_max_filesize` / `post_max_size`.

Protocol id: `pinion` · version: `2` · PHP 8.1+

---

## Quick start

### Server (PHP)

```bash
composer require pinoox/pinion
```

```php
use Pinoox\Pinion\Pinion;

Pinion::configure(['storage_path' => '/tmp/pinion']);

$handler = Pinion::http(['destination' => 'uploads/videos']);

$handler->init($_POST);           // POST /init
$handler->upload($_POST, $file);  // POST /upload
$handler->complete($_POST);       // POST /complete
```

Three steps: **init → upload parts → complete**.

### Browser (JavaScript)

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

No Axios required — uses native `fetch`. Full client docs: **[client/README.md](./client/README.md)**

---

## Table of contents

- [Quick start](#quick-start)
- [What is Pinion](#what-is-pinion)
- [Install](#install)
- [Browser client](#browser-client)
- [Server usage](#server-usage)
  - [Plain PHP](#plain-php)
  - [Pinoox](#pinoox)
  - [Laravel](#laravel)
- [HTTP protocol](#http-protocol)
- [Configuration](#configuration)
- [API surface](#api-surface)
- [Package structure](#package-structure)
- [License](#license)

---

## What is Pinion

| Scenario | Why Pinion |
|----------|------------|
| Shared hosting (20 MB upload cap) | Send 5 MB parts instead of one huge POST |
| Slow or mobile networks | Resume after disconnect via `fingerprint` |
| Video / archive uploads | Hundreds of MB or GB without raising `php.ini` limits |
| Admin panels & CMS | Progress bar with parallel parts |
| API file intake | Stable contract (`pinion` v2) across PHP stacks |
| Integrity-sensitive files | SHA-256 per part (`chunk_hash`) and optional whole-file hash |

Pinion does **not** replace object storage (S3, MinIO). It solves the **PHP request size** problem and assembles the file on your server disk.

---

## Install

### PHP (Packagist)

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

### JavaScript (npm)

```bash
npm install @pinooxhq/pinion-client
# optional: npm install axios
```

| Registry | Package |
|----------|---------|
| Packagist | `pinoox/pinion` |
| npm | `@pinooxhq/pinion-client` |

---

## Browser client

Published on npm as **`@pinooxhq/pinion-client`**.  
Full guide (usage levels, API, publish): **[client/README.md](./client/README.md)**

### Ways to use (summary)

| Level | API | When |
|-------|-----|------|
| Fastest | `uploadFile(file, options)` | Single button, one-off upload |
| Fluent | `pinion({ baseURL }).for(file).upload()` | Reusable uploader instance |
| Full | `createPinionFetch(options)` | Batch, hooks, cancel |
| Manual | `client.api.init()` / `uploadPart()` / `complete()` | Custom UI or flow |
| Axios | `pinion(axios, options)` | Need `onUploadProgress` per chunk |

### Fetch (default — zero deps)

```javascript
import { pinion } from '@pinooxhq/pinion-client';

const uploader = pinion({ baseURL: '/api/pinion', unwrapPreset: 'pinoox' });

await uploader.for(file).upload({
  parallel: 2,
  retry: 2,
  onProgress: ({ percent, speed, eta }) => console.log(percent, speed, eta),
});
```

### Axios (optional)

```javascript
import axios from 'axios';
import { createPinionAxios } from '@pinooxhq/pinion-client';

const { client } = createPinionAxios(axios, {
  baseURL: '/api/pinion',
  unwrapPreset: 'pinoox',
});

await client.upload(file, {
  onProgress: ({ percent }) => console.log(percent),
  onUploadProgress: (event, index) => console.log('part', index),
});
```

### Composer vendor path (without npm)

```javascript
import { createPinionClient } from './vendor/pinoox/pinion/client/src/index.js';
```

---

## Server usage

### Plain PHP

Programmatic flow without a framework.

```php
use Pinoox\Pinion\Pinion;
use Pinoox\Pinion\Support\NativePathResolver;

Pinion::configure([
    'storage_path' => '/var/www/storage/pinion-temp',
    'chunk_size' => 5 * 1024 * 1024,
    'verify_chunks' => true,
], new NativePathResolver('/var/www'));

$result = Pinion::begin()
    ->filename('report-Q1.pdf')
    ->size(48_000_000)
    ->to('uploads/documents')
    ->extensions(['pdf'])
    ->fingerprint($clientFingerprint)
    ->init();

$uploadId = $result->session->id;

foreach ($missingIndexes as $index) {
    Pinion::manager()->receive($uploadId, $index, $chunkBinary, $chunkHash);
}

$complete = Pinion::manager()->complete($uploadId);
// $complete->path → /var/www/uploads/documents/report-Q1.pdf
```

Single-file HTTP router:

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

Maintenance:

```php
$session = Pinion::manager()->status($uploadId);
$pending = Pinion::manager()->list('pending');
$removed = Pinion::manager()->cleanExpired();
Pinion::manager()->abort($uploadId);
```

### Pinoox

Use the **Portal** and core HTTP bridge — do not wire the package manually.

```php
use Pinoox\Portal\Pinion;

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

    public function init(Request $request)     { return $this->pinion()->init($request); }
    public function upload(Request $request)   { return $this->pinion()->upload($request); }
    public function complete(Request $request) { return $this->pinion()->complete($request); }
    public function status(string $uploadId)   { return $this->pinion()->status($uploadId); }
    public function abort(string $uploadId)    { return $this->pinion()->abort($uploadId); }
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

### Laravel

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

**3. Controller**

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

**Client flow (browser / mobile):**

1. Build `fingerprint` from `name:size:lastModified:type`.
2. `POST /init` → get `upload_id` and `missing_indexes`.
3. For each index: slice file, SHA-256 → `POST /upload`.
4. Optional parallel uploads (`parallel=2`).
5. `POST /complete`.
6. Keep `upload_id` in `localStorage` until done (resume support).

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

Implement `PathResolverInterface` for multi-root apps:

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

## API surface

### PHP

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

**Pinoox extras** (in `pincore`):

| Piece | Role |
|-------|------|
| `Pinoox\Portal\Pinion` | Static portal over `Manager` |
| `Pinoox\Component\Pinion\HttpHandler` | Wraps package handler → `JsonResponse` |
| CLI | `php pinoox pinion:list`, `pinion:info`, `pinion:clean` |

**Laravel extras** (auto-discovery):

| Piece | Role |
|-------|------|
| `PinionServiceProvider` | Registers `Manager` + `HttpHandler` singletons |
| `Pinion` facade | `Pinion::begin()`, `Pinion::http()` |

### JavaScript

| Export | Role |
|--------|------|
| `uploadFile(file, options)` | One-shot upload (fetch) |
| `pinion(options)` | Fluent client factory |
| `createPinionFetch(options)` | Explicit fetch client |
| `createPinionClient(axios, options)` | Full client with Axios |
| `createPinionAxios(axios, options)` | Axios instance + client |
| `client.upload(file, opts)` | `init → parts → complete` with parallel + retry |
| `client.api` | Low-level `init`, `uploadPart`, `complete`, `status`, `abort` |
| `buildFingerprint(file)` / `shouldUsePinion(file)` | Resume key & threshold helper |
| `PinionError` | Typed errors with `code` |
| `sha256Hex(blob)` | Per-part checksum helper |

Details: **[client/README.md](./client/README.md)**

---

## Package structure

```
packages/pinion/
├── client/                 # @pinooxhq/pinion-client (npm)
│   ├── src/
│   ├── types/
│   ├── package.json
│   └── README.md           # npm client guide
├── config/pinion.php
├── src/                    # PHP protocol engine (Packagist)
├── tests/
└── README.md
```

---

## License

MIT — [Pinoox](https://www.pinoox.com)
