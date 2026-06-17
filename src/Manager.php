<?php

namespace Pinoox\Pinion;

use Pinoox\Pinion\Contract\PathResolverInterface;
use Pinoox\Pinion\Exception\PinionException;
use Pinoox\Pinion\Support\Checksum;
use Pinoox\Pinion\Support\NativePathResolver;

class Manager
{
    private Store $store;
    /** @var array<string, mixed> */
    private array $config;
    private PathResolverInterface $paths;

    /**
     * @param array<string, mixed>|null $configOverrides
     */
    public function __construct(
        ?Store $store = null,
        ?array $configOverrides = null,
        ?PathResolverInterface $paths = null,
    ) {
        $this->config = Config::resolve($configOverrides);
        $this->store = $store ?? new Store($this->config['storage_path']);
        $this->paths = $paths ?? new NativePathResolver();
    }

    public function begin(): Builder
    {
        return new Builder($this);
    }

    /**
     * @param list<string> $extensions
     * @param array<string, mixed> $meta
     */
    public function init(
        string $filename,
        int $size,
        string $destination,
        array $extensions = [],
        ?int $chunkSize = null,
        ?string $mime = null,
        ?string $fingerprint = null,
        ?string $fileHash = null,
        array $meta = [],
    ): Result {
        try {
            if ($fingerprint !== null && $fingerprint !== '') {
                $existing = $this->store->findByFingerprint($fingerprint);
                if ($existing !== null) {
                    return Result::ok($existing, resumed: true);
                }
            }

            $filename = $this->sanitizeFilename($filename);
            $this->assertSize($size);
            $this->assertExtension($filename, $extensions);

            $chunkSize = Config::normalizeChunkSize($chunkSize ?? (int) $this->config['chunk_size'], $this->config);
            $totalChunks = (int) ceil($size / $chunkSize);
            $uploadId = $this->generateUploadId();
            $now = time();
            $ttl = (int) ($this->config['ttl'] ?? 86400);
            $strategy = (string) ($this->config['storage_strategy'] ?? Config::STRATEGY_PARTS);

            $session = new Session(
                id: $uploadId,
                filename: $filename,
                size: $size,
                chunk_size: $chunkSize,
                total_chunks: $totalChunks,
                destination: $this->normalizeDestination($destination),
                extensions: $extensions,
                status: Session::STATUS_PENDING,
                bytes_received: 0,
                received_indexes: [],
                created_at: $now,
                expires_at: $now + $ttl,
                mime: $mime,
                fingerprint: $fingerprint,
                file_hash: $fileHash,
                meta: $meta,
                storage_strategy: $strategy,
            );

            $this->store->save($session);
            $this->prepareWorkspace($session);

            return Result::ok($session);
        } catch (PinionException $e) {
            return Result::fail($e->getMessage());
        }
    }

    public function receive(string $uploadId, int $index, string $binary, ?string $chunkHash = null): Result
    {
        try {
            $session = $this->requirePendingSession($uploadId);
            $this->assertChunkIndex($session, $index);
            $this->assertChunkSize($session, $index, strlen($binary));

            if ($this->config['verify_chunks'] ?? true) {
                if ($chunkHash !== null && $chunkHash !== '' && !Checksum::matches($chunkHash, Checksum::hash($binary))) {
                    throw PinionException::checksumMismatch($index);
                }
            }

            $this->writeChunk($session, $index, $binary);

            $received = $session->received_indexes;
            if (!in_array($index, $received, true)) {
                $received[] = $index;
            }

            sort($received);
            $chunkHashes = $session->chunk_hashes;
            $chunkHashes[$index] = Checksum::hash($binary);

            $session = $this->cloneSession($session, [
                'bytes_received' => $this->measureBytes($session),
                'received_indexes' => $received,
                'chunk_hashes' => $chunkHashes,
            ]);

            $this->store->save($session);

            return Result::ok($session);
        } catch (PinionException $e) {
            return Result::fail($e->getMessage(), $this->store->load($uploadId));
        }
    }

    public function complete(string $uploadId, ?string $fileHash = null): Result
    {
        try {
            $session = $this->requirePendingSession($uploadId);

            if (!$session->isComplete()) {
                throw PinionException::invalid('Upload is incomplete.');
            }

            $destinationDir = $this->resolveDestinationDir($session->destination);
            if (!is_dir($destinationDir)) {
                mkdir($destinationDir, 0755, true);
            }

            $finalPath = $destinationDir . '/' . $session->filename;
            if (is_file($finalPath)) {
                @unlink($finalPath);
            }

            $this->assembleFile($session, $finalPath);

            $actualSize = is_file($finalPath) ? (int) filesize($finalPath) : 0;
            if ($actualSize !== $session->size) {
                @unlink($finalPath);
                throw PinionException::invalid('Uploaded file size mismatch.');
            }

            if (($this->config['verify_file_hash'] ?? false) || $fileHash !== null || $session->file_hash !== null) {
                $expected = $fileHash ?? $session->file_hash;
                if ($expected !== null && $expected !== '' && !Checksum::matches($expected, Checksum::file($finalPath))) {
                    @unlink($finalPath);
                    throw PinionException::invalid('Uploaded file hash mismatch.');
                }
            }

            $this->store->remove($uploadId);

            $session = $this->cloneSession($session, [
                'status' => Session::STATUS_COMPLETED,
                'bytes_received' => $session->size,
                'final_path' => $finalPath,
            ]);

            return Result::ok($session, $finalPath);
        } catch (PinionException $e) {
            return Result::fail($e->getMessage(), $this->store->load($uploadId));
        }
    }

    public function abort(string $uploadId): bool
    {
        $session = $this->store->load($uploadId);
        if ($session === null) {
            return false;
        }

        if ($session->status === Session::STATUS_COMPLETED) {
            return false;
        }

        $this->store->remove($uploadId);

        return true;
    }

    public function status(string $uploadId): ?Session
    {
        $session = $this->store->load($uploadId);
        if ($session === null) {
            return null;
        }

        if ($session->status === Session::STATUS_PENDING && $session->isExpired()) {
            $this->store->remove($uploadId);

            return null;
        }

        return $this->cloneSession($session, [
            'bytes_received' => $this->measureBytes($session),
        ]);
    }

    /**
     * @return list<Session>
     */
    public function list(?string $status = null): array
    {
        return $this->store->all($status);
    }

    public function cleanExpired(): int
    {
        $removed = 0;
        foreach ($this->store->all() as $session) {
            if ($session->status !== Session::STATUS_PENDING) {
                continue;
            }

            if ($session->isExpired()) {
                $this->store->remove($session->id);
                $removed++;
            }
        }

        return $removed;
    }

    private function prepareWorkspace(Session $session): void
    {
        if ($session->storage_strategy === Config::STRATEGY_SPARSE) {
            touch($this->store->sparseBlobPath($session->id));

            return;
        }

        $this->store->partsDir($session->id);
    }

    private function writeChunk(Session $session, int $index, string $binary): void
    {
        if ($session->storage_strategy === Config::STRATEGY_SPARSE) {
            $offset = $index * $session->chunk_size;
            $handle = fopen($this->store->sparseBlobPath($session->id), 'c+b');
            if ($handle === false) {
                throw PinionException::invalid('Unable to open sparse blob.');
            }

            try {
                if (!flock($handle, LOCK_EX)) {
                    throw PinionException::invalid('Unable to lock sparse blob.');
                }

                fseek($handle, $offset);
                $written = fwrite($handle, $binary);
                fflush($handle);
                flock($handle, LOCK_UN);

                if ($written === false) {
                    throw PinionException::invalid('Failed to write chunk data.');
                }
            } finally {
                fclose($handle);
            }

            return;
        }

        file_put_contents($this->store->partPath($session->id, $index), $binary, LOCK_EX);
    }

    private function assembleFile(Session $session, string $finalPath): void
    {
        $out = fopen($finalPath, 'wb');
        if ($out === false) {
            throw PinionException::invalid('Unable to create final file.');
        }

        try {
            if ($session->storage_strategy === Config::STRATEGY_SPARSE) {
                $in = fopen($this->store->sparseBlobPath($session->id), 'rb');
                if ($in === false) {
                    throw PinionException::invalid('Unable to read sparse blob.');
                }

                stream_copy_to_stream($in, $out);
                fclose($in);

                return;
            }

            for ($index = 0; $index < $session->total_chunks; $index++) {
                $part = $this->store->partPath($session->id, $index);
                if (!is_file($part)) {
                    throw PinionException::invalid('Missing chunk part: ' . $index);
                }

                $in = fopen($part, 'rb');
                if ($in === false) {
                    throw PinionException::invalid('Unable to read chunk part.');
                }

                stream_copy_to_stream($in, $out);
                fclose($in);
            }
        } finally {
            fclose($out);
        }
    }

    private function measureBytes(Session $session): int
    {
        if ($session->storage_strategy === Config::STRATEGY_SPARSE) {
            $path = $this->store->sparseBlobPath($session->id);

            return is_file($path) ? (int) filesize($path) : 0;
        }

        $bytes = 0;
        foreach ($session->received_indexes as $index) {
            $part = $this->store->partPath($session->id, $index);
            if (is_file($part)) {
                $bytes += (int) filesize($part);
            }
        }

        return min($session->size, $bytes);
    }

    private function generateUploadId(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);

        return sprintf(
            '%s-%s-%s-%s-%s',
            substr($hex, 0, 8),
            substr($hex, 8, 4),
            substr($hex, 12, 4),
            substr($hex, 16, 4),
            substr($hex, 20, 12),
        );
    }

    private function requirePendingSession(string $uploadId): Session
    {
        $session = $this->store->load($uploadId);
        if ($session === null) {
            throw PinionException::notFound($uploadId);
        }

        if ($session->status === Session::STATUS_COMPLETED) {
            throw PinionException::completed($uploadId);
        }

        if ($session->isExpired()) {
            $this->store->remove($uploadId);
            throw PinionException::expired($uploadId);
        }

        return $session;
    }

    private function assertSize(int $size): void
    {
        $max = (int) ($this->config['max_file_size'] ?? 0);
        if ($max > 0 && $size > $max) {
            throw PinionException::invalid('File exceeds maximum allowed size.');
        }
    }

    /**
     * @param list<string> $extensions
     */
    private function assertExtension(string $filename, array $extensions): void
    {
        if ($extensions === []) {
            return;
        }

        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        if ($ext === '' || !in_array($ext, $extensions, true)) {
            throw PinionException::invalid('File extension is not allowed.');
        }
    }

    private function assertChunkIndex(Session $session, int $index): void
    {
        if ($index < 0 || $index >= $session->total_chunks) {
            throw PinionException::invalid('Chunk index is out of range.');
        }
    }

    private function assertChunkSize(Session $session, int $index, int $length): void
    {
        if ($length <= 0) {
            throw PinionException::invalid('Chunk payload is empty.');
        }

        $expected = $session->chunk_size;
        if ($index === $session->total_chunks - 1) {
            $remainder = $session->size % $session->chunk_size;
            $expected = $remainder > 0 ? $remainder : $session->chunk_size;
        }

        if ($length > $expected) {
            throw PinionException::invalid('Chunk payload exceeds expected size.');
        }
    }

    private function sanitizeFilename(string $filename): string
    {
        $filename = basename(str_replace('\\', '/', $filename));
        $filename = preg_replace('/[^\w\.\-]+/u', '_', $filename) ?? 'upload.bin';

        if ($filename === '' || $filename === '.' || $filename === '..') {
            throw PinionException::invalid('Invalid filename.');
        }

        return $filename;
    }

    private function normalizeDestination(string $destination): string
    {
        $destination = trim(str_replace('\\', '/', $destination), '/');

        if ($destination === '' || str_contains($destination, '..')) {
            throw PinionException::invalid('Invalid destination path.');
        }

        return $destination;
    }

    private function resolveDestinationDir(string $destination): string
    {
        return $this->paths->resolve($destination);
    }

    /**
     * @param array<string, mixed> $changes
     */
    private function cloneSession(Session $session, array $changes): Session
    {
        $data = $session->toArray();
        unset($data['progress'], $data['missing_indexes'], $data['protocol'], $data['protocol_version'], $data['resumable']);
        $data['chunk_hashes'] = $session->chunk_hashes;
        $data = array_merge($data, $changes);

        return Session::fromArray($data);
    }
}
