<?php

namespace Pinoox\Pinion;

final class Builder
{
    private ?string $filename = null;
    private int $size = 0;
    private ?string $destination = null;
    private ?int $chunkSize = null;
    /** @var list<string> */
    private array $extensions = [];
    private ?string $mime = null;
    private ?string $fingerprint = null;
    private ?string $fileHash = null;
    /** @var array<string, mixed> */
    private array $meta = [];

    public function __construct(private readonly Manager $manager)
    {
    }

    public function filename(string $filename): self
    {
        $this->filename = $filename;

        return $this;
    }

    public function size(int $size): self
    {
        $this->size = $size;

        return $this;
    }

    public function to(string $destination): self
    {
        $this->destination = $destination;

        return $this;
    }

    public function chunkSize(string|int $size): self
    {
        $this->chunkSize = Config::parseSize($size);

        return $this;
    }

    public function extensions(string|array $extensions): self
    {
        if (is_string($extensions)) {
            $extensions = array_map('trim', explode(',', $extensions));
        }

        $this->extensions = array_values(array_filter(array_map(static function ($ext) {
            return strtolower(ltrim((string) $ext, '.'));
        }, $extensions)));

        return $this;
    }

    public function mime(?string $mime): self
    {
        $this->mime = $mime;

        return $this;
    }

    public function fingerprint(?string $fingerprint): self
    {
        $this->fingerprint = $fingerprint;

        return $this;
    }

    public function fileHash(?string $fileHash): self
    {
        $this->fileHash = $fileHash;

        return $this;
    }

    /**
     * @param array<string, mixed> $meta
     */
    public function meta(array $meta): self
    {
        $this->meta = $meta;

        return $this;
    }

    public function init(): Result
    {
        if ($this->filename === null || $this->filename === '') {
            return Result::fail('filename_required');
        }

        if ($this->size <= 0) {
            return Result::fail('size_required');
        }

        if ($this->destination === null || $this->destination === '') {
            return Result::fail('destination_required');
        }

        return $this->manager->init(
            $this->filename,
            $this->size,
            $this->destination,
            $this->extensions,
            $this->chunkSize,
            $this->mime,
            $this->fingerprint,
            $this->fileHash,
            $this->meta,
        );
    }
}
