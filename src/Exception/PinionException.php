<?php

namespace Pinoox\Pinion\Exception;

use RuntimeException;

class PinionException extends RuntimeException
{
    public static function notFound(string $uploadId): self
    {
        return new self('Pinion session not found: ' . $uploadId);
    }

    public static function invalid(string $message): self
    {
        return new self($message);
    }

    public static function expired(string $uploadId): self
    {
        return new self('Pinion session expired: ' . $uploadId);
    }

    public static function completed(string $uploadId): self
    {
        return new self('Pinion session already completed: ' . $uploadId);
    }

    public static function checksumMismatch(int $index): self
    {
        return new self('Chunk checksum mismatch at index ' . $index);
    }
}
