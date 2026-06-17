<?php

namespace Pinoox\Pinion;

final class Session
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_ABORTED = 'aborted';

    /**
     * @param list<int> $received_indexes
     * @param array<int, string> $chunk_hashes
     * @param array<string, mixed> $meta
     */
    public function __construct(
        public readonly string $id,
        public readonly string $filename,
        public readonly int $size,
        public readonly int $chunk_size,
        public readonly int $total_chunks,
        public readonly string $destination,
        public readonly array $extensions,
        public readonly string $status,
        public readonly int $bytes_received,
        public readonly array $received_indexes,
        public readonly int $created_at,
        public readonly int $expires_at,
        public readonly ?string $final_path = null,
        public readonly ?string $mime = null,
        public readonly ?string $fingerprint = null,
        public readonly ?string $file_hash = null,
        public readonly array $chunk_hashes = [],
        public readonly array $meta = [],
        public readonly string $storage_strategy = Config::STRATEGY_PARTS,
    ) {
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function fromArray(array $data): self
    {
        return new self(
            id: (string) ($data['id'] ?? ''),
            filename: (string) ($data['filename'] ?? ''),
            size: (int) ($data['size'] ?? 0),
            chunk_size: (int) ($data['chunk_size'] ?? 0),
            total_chunks: (int) ($data['total_chunks'] ?? 0),
            destination: (string) ($data['destination'] ?? ''),
            extensions: array_values(array_map('strval', $data['extensions'] ?? [])),
            status: (string) ($data['status'] ?? self::STATUS_PENDING),
            bytes_received: (int) ($data['bytes_received'] ?? 0),
            received_indexes: array_values(array_map('intval', $data['received_indexes'] ?? [])),
            created_at: (int) ($data['created_at'] ?? 0),
            expires_at: (int) ($data['expires_at'] ?? 0),
            final_path: isset($data['final_path']) ? (string) $data['final_path'] : null,
            mime: isset($data['mime']) ? (string) $data['mime'] : null,
            fingerprint: isset($data['fingerprint']) ? (string) $data['fingerprint'] : null,
            file_hash: isset($data['file_hash']) ? (string) $data['file_hash'] : null,
            chunk_hashes: array_map('strval', $data['chunk_hashes'] ?? []),
            meta: is_array($data['meta'] ?? null) ? $data['meta'] : [],
            storage_strategy: (string) ($data['storage_strategy'] ?? Config::STRATEGY_PARTS),
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'filename' => $this->filename,
            'size' => $this->size,
            'chunk_size' => $this->chunk_size,
            'total_chunks' => $this->total_chunks,
            'destination' => $this->destination,
            'extensions' => $this->extensions,
            'status' => $this->status,
            'bytes_received' => $this->bytes_received,
            'received_indexes' => $this->received_indexes,
            'missing_indexes' => $this->missingIndexes(),
            'created_at' => $this->created_at,
            'expires_at' => $this->expires_at,
            'final_path' => $this->final_path,
            'mime' => $this->mime,
            'fingerprint' => $this->fingerprint,
            'file_hash' => $this->file_hash,
            'meta' => $this->meta,
            'storage_strategy' => $this->storage_strategy,
            'progress' => $this->progress(),
            'protocol' => Config::PROTOCOL,
            'protocol_version' => Config::PROTOCOL_VERSION,
            'resumable' => true,
        ];
    }

    /**
     * @return list<int>
     */
    public function missingIndexes(): array
    {
        $missing = [];
        $received = array_flip($this->received_indexes);

        for ($i = 0; $i < $this->total_chunks; $i++) {
            if (!isset($received[$i])) {
                $missing[] = $i;
            }
        }

        return $missing;
    }

    public function progress(): float
    {
        if ($this->size <= 0) {
            return 0.0;
        }

        return round(min(100, ($this->bytes_received / $this->size) * 100), 2);
    }

    public function isComplete(): bool
    {
        return $this->missingIndexes() === [];
    }

    public function isExpired(): bool
    {
        return $this->expires_at > 0 && time() > $this->expires_at;
    }
}
