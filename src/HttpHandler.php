<?php

namespace Pinoox\Pinion;

use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * Framework-agnostic HTTP adapter for the Pinion protocol.
 *
 * Returns plain arrays — map to JsonResponse in your framework.
 */
final class HttpHandler
{
    public function __construct(
        private readonly Manager $manager,
        /** @var array<string, mixed> */
        private readonly array $defaults = [],
    ) {
    }

    /**
     * @param array<string, mixed> $defaults
     */
    public static function make(Manager $manager, array $defaults = []): self
    {
        return new self($manager, $defaults);
    }

    /**
     * @param array<string, mixed> $input
     * @return array{success: bool, data?: mixed, error?: array<string, mixed>}
     */
    public function init(array $input): array
    {
        $filename = (string) ($input['filename'] ?? '');
        $size = (int) ($input['size'] ?? 0);
        $destination = (string) ($input['destination'] ?? $this->defaults['destination'] ?? '');
        $chunkSize = $input['chunk_size'] ?? null;
        $extensions = $input['extensions'] ?? $this->defaults['extensions'] ?? [];
        $mime = $input['mime'] ?? null;
        $fingerprint = $input['fingerprint'] ?? null;
        $fileHash = $input['file_hash'] ?? $input['fileHash'] ?? null;
        $meta = is_array($input['meta'] ?? null) ? $input['meta'] : [];

        if (is_string($extensions)) {
            $extensions = array_map('trim', explode(',', $extensions));
        }

        $result = $this->manager->init(
            $filename,
            $size,
            $destination,
            is_array($extensions) ? $extensions : [],
            $chunkSize !== null ? (int) $chunkSize : null,
            is_string($mime) ? $mime : null,
            is_string($fingerprint) ? $fingerprint : null,
            is_string($fileHash) ? $fileHash : null,
            $meta,
        );

        if (!$result->success) {
            return $this->error('PINION_INIT_FAILED', $result->error ?? 'init_failed');
        }

        return $this->success($result->toArray());
    }

    /**
     * @param array<string, mixed> $input
     */
    public function upload(array $input, mixed $chunkFile = null): array
    {
        $uploadId = (string) ($input['upload_id'] ?? $input['uploadId'] ?? '');
        $index = (int) ($input['index'] ?? -1);
        $chunkHash = $input['chunk_hash'] ?? $input['chunkHash'] ?? null;
        $binary = $this->readChunkBinary($chunkFile);

        if ($uploadId === '' || $index < 0 || $binary === '') {
            return $this->error('PINION_INVALID', 'invalid_chunk_request');
        }

        $result = $this->manager->receive(
            $uploadId,
            $index,
            $binary,
            is_string($chunkHash) ? $chunkHash : null,
        );

        if (!$result->success) {
            return $this->error('PINION_FAILED', $result->error ?? 'chunk_failed', [
                'session' => $result->session?->toArray(),
            ]);
        }

        return $this->success($result->session?->toArray());
    }

    /**
     * @param array<string, mixed> $input
     */
    public function complete(array $input): array
    {
        $uploadId = (string) ($input['upload_id'] ?? $input['uploadId'] ?? '');
        $fileHash = $input['file_hash'] ?? $input['fileHash'] ?? null;

        if ($uploadId === '') {
            return $this->error('PINION_INVALID', 'upload_id_required');
        }

        $result = $this->manager->complete($uploadId, is_string($fileHash) ? $fileHash : null);

        if (!$result->success) {
            return $this->error('PINION_COMPLETE_FAILED', $result->error ?? 'complete_failed', [
                'session' => $result->session?->toArray(),
            ]);
        }

        return $this->success([
            'session' => $result->session?->toArray(),
            'path' => $result->path,
            'filename' => $result->session?->filename,
            'resumed' => $result->resumed,
        ]);
    }

    public function status(string $uploadId): array
    {
        $session = $this->manager->status($uploadId);
        if ($session === null) {
            return $this->error('PINION_NOT_FOUND', 'session_not_found', status: 404);
        }

        return $this->success($session->toArray());
    }

    public function abort(string $uploadId): array
    {
        if (!$this->manager->abort($uploadId)) {
            return $this->error('PINION_ABORT_FAILED', 'abort_failed', status: 404);
        }

        return $this->success(['aborted' => true]);
    }

    private function readChunkBinary(mixed $chunkFile): string
    {
        if ($chunkFile instanceof UploadedFile) {
            return (string) file_get_contents($chunkFile->getRealPath() ?: '');
        }

        if (is_string($chunkFile) && is_file($chunkFile)) {
            return (string) file_get_contents($chunkFile);
        }

        if (is_string($chunkFile)) {
            return $chunkFile;
        }

        return '';
    }

    /**
     * @param array<string, mixed> $details
     * @return array{success: false, error: array<string, mixed>}
     */
    private function error(string $code, string $message, array $details = [], int $status = 400): array
    {
        return [
            'success' => false,
            'status' => $status,
            'error' => [
                'code' => $code,
                'message' => $message,
                'details' => $details,
            ],
        ];
    }

    /**
     * @return array{success: true, data: mixed}
     */
    private function success(mixed $data): array
    {
        return [
            'success' => true,
            'data' => $data,
        ];
    }
}
