<?php

namespace Pinoox\Pinion\Support;

use Pinoox\Pinion\Contract\PathResolverInterface;

final class NativePathResolver implements PathResolverInterface
{
    public function __construct(private readonly ?string $basePath = null)
    {
    }

    public function resolve(string $reference): string
    {
        $reference = str_replace('\\', '/', $reference);

        if ($this->isAbsolute($reference)) {
            return $reference;
        }

        $base = $this->basePath ?? getcwd() ?: '.';

        return rtrim(str_replace('\\', '/', $base), '/') . '/' . ltrim($reference, '/');
    }

    private function isAbsolute(string $path): bool
    {
        return str_starts_with($path, '/')
            || preg_match('/^[A-Za-z]:\//', $path) === 1;
    }
}
