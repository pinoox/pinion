<?php

namespace Pinoox\Pinion;

use Pinoox\Pinion\Exception\PinionException;

final class Store
{
    private string $root;

    public function __construct(?string $root = null)
    {
        $this->root = $root ?? (string) Config::resolve()['storage_path'];
        $this->ensureDirectory($this->root);
    }

    public function root(): string
    {
        return $this->root;
    }

    public function sessionPath(string $uploadId): string
    {
        return $this->uploadDir($uploadId) . '/session.json';
    }

    public function sparseBlobPath(string $uploadId): string
    {
        return $this->uploadDir($uploadId) . '/blob.part';
    }

    public function partPath(string $uploadId, int $index): string
    {
        return $this->partsDir($uploadId) . '/' . $index . '.part';
    }

    public function partsDir(string $uploadId): string
    {
        $dir = $this->uploadDir($uploadId) . '/parts';
        $this->ensureDirectory($dir);

        return $dir;
    }

    public function uploadDir(string $uploadId): string
    {
        $this->assertValidId($uploadId);

        return $this->root . '/' . $uploadId;
    }

    public function save(Session $session): void
    {
        $dir = $this->uploadDir($session->id);
        $this->ensureDirectory($dir);
        $this->writeJson($this->sessionPath($session->id), $this->sessionPayload($session));
    }

    public function load(string $uploadId): ?Session
    {
        $path = $this->sessionPath($uploadId);
        if (!is_file($path)) {
            return null;
        }

        $data = json_decode((string) file_get_contents($path), true);
        if (!is_array($data)) {
            return null;
        }

        return Session::fromArray($data);
    }

    public function findByFingerprint(string $fingerprint): ?Session
    {
        if ($fingerprint === '') {
            return null;
        }

        foreach ($this->all(Session::STATUS_PENDING) as $session) {
            if ($session->fingerprint === $fingerprint && !$session->isExpired()) {
                return $session;
            }
        }

        return null;
    }

    /**
     * @return list<Session>
     */
    public function all(?string $status = null): array
    {
        if (!is_dir($this->root)) {
            return [];
        }

        $sessions = [];
        foreach (scandir($this->root) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }

            $session = $this->load($entry);
            if ($session === null) {
                continue;
            }

            if ($status !== null && $session->status !== $status) {
                continue;
            }

            $sessions[] = $session;
        }

        usort($sessions, static fn (Session $a, Session $b) => $b->created_at <=> $a->created_at);

        return $sessions;
    }

    public function remove(string $uploadId): void
    {
        $dir = $this->uploadDir($uploadId);
        if (!is_dir($dir)) {
            return;
        }

        $this->removeDirectory($dir);
    }

    /**
     * @return array<string, mixed>
     */
    private function sessionPayload(Session $session): array
    {
        $data = $session->toArray();
        unset(
            $data['progress'],
            $data['missing_indexes'],
            $data['protocol'],
            $data['protocol_version'],
            $data['resumable'],
        );
        $data['chunk_hashes'] = $session->chunk_hashes;

        return $data;
    }

    /**
     * @param array<string, mixed> $data
     */
    private function writeJson(string $path, array $data): void
    {
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw PinionException::invalid('Failed to encode Pinion session.');
        }

        file_put_contents($path, $json, LOCK_EX);
    }

    private function ensureDirectory(string $path): void
    {
        if (!is_dir($path)) {
            mkdir($path, 0755, true);
        }
    }

    private function removeDirectory(string $dir): void
    {
        foreach (scandir($dir) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }

            $path = $dir . '/' . $entry;
            if (is_dir($path)) {
                $this->removeDirectory($path);
                continue;
            }

            @unlink($path);
        }

        @rmdir($dir);
    }

    private function assertValidId(string $uploadId): void
    {
        if ($uploadId === '' || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $uploadId)) {
            throw PinionException::invalid('Invalid Pinion upload id.');
        }
    }
}
