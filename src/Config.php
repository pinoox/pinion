<?php

namespace Pinoox\Pinion;

final class Config
{
    public const PROTOCOL = 'pinion';
    public const PROTOCOL_VERSION = 2;
    public const STRATEGY_PARTS = 'parts';
    public const STRATEGY_SPARSE = 'sparse';

    /**
     * @param array<string, mixed>|null $overrides
     * @return array<string, mixed>
     */
    public static function resolve(?array $overrides = null): array
    {
        $defaults = self::defaults();
        $merged = array_merge($defaults, $overrides ?? []);

        $merged['chunk_size'] = self::normalizeChunkSize((int) $merged['chunk_size'], $merged);
        $merged['storage_path'] = rtrim(str_replace('\\', '/', (string) $merged['storage_path']), '/');

        return $merged;
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        $file = dirname(__DIR__) . '/config/pinion.php';

        return is_file($file) ? (require $file) : [
            'protocol' => self::PROTOCOL,
            'protocol_version' => self::PROTOCOL_VERSION,
            'chunk_size' => 5 * 1024 * 1024,
            'min_chunk_size' => 1024 * 1024,
            'max_chunk_size' => 10 * 1024 * 1024,
            'ttl' => 86400,
            'max_file_size' => 2 * 1024 * 1024 * 1024,
            'storage_path' => sys_get_temp_dir() . '/pinion',
            'storage_strategy' => self::STRATEGY_PARTS,
            'verify_chunks' => true,
            'verify_file_hash' => false,
        ];
    }

    public static function normalizeChunkSize(int $size, ?array $config = null): int
    {
        $config ??= self::resolve();
        $min = (int) ($config['min_chunk_size'] ?? 1024 * 1024);
        $max = (int) ($config['max_chunk_size'] ?? 10 * 1024 * 1024);

        return max($min, min($max, $size > 0 ? $size : (int) $config['chunk_size']));
    }

    public static function parseSize(string|int $value): int
    {
        if (is_int($value)) {
            return $value;
        }

        $value = trim($value);
        if ($value === '' || !preg_match('/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i', $value, $matches)) {
            return 0;
        }

        $amount = (float) $matches[1];
        $unit = strtoupper($matches[2] ?? 'B');

        return (int) round(match ($unit) {
            'GB' => $amount * 1024 * 1024 * 1024,
            'MB' => $amount * 1024 * 1024,
            'KB' => $amount * 1024,
            default => $amount,
        });
    }
}
