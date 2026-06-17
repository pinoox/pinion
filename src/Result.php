<?php

namespace Pinoox\Pinion;

final class Result
{
    public function __construct(
        public readonly bool $success,
        public readonly ?Session $session = null,
        public readonly ?string $path = null,
        public readonly ?string $error = null,
        public readonly bool $resumed = false,
    ) {
    }

    public static function ok(Session $session, ?string $path = null, bool $resumed = false): self
    {
        return new self(true, $session, $path, resumed: $resumed);
    }

    public static function fail(string $error, ?Session $session = null): self
    {
        return new self(false, $session, error: $error);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'success' => $this->success,
            'resumed' => $this->resumed,
            'path' => $this->path,
            'error' => $this->error,
            'session' => $this->session?->toArray(),
        ];
    }
}
