<?php

namespace Pinoox\Pinion\Support;

final class Checksum
{
    public static function hash(string $binary, string $algo = 'sha256'): string
    {
        return hash($algo, $binary);
    }

    public static function file(string $path, string $algo = 'sha256'): string
    {
        return (string) hash_file($algo, $path);
    }

    public static function matches(string $expected, string $actual): bool
    {
        return hash_equals(strtolower($expected), strtolower($actual));
    }
}
