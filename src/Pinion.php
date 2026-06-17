<?php

namespace Pinoox\Pinion;

use Pinoox\Pinion\Contract\PathResolverInterface;
use Pinoox\Pinion\Support\NativePathResolver;

/**
 * Entry point for the Pinion resumable upload protocol.
 */
final class Pinion
{
    private static ?Manager $manager = null;
    /** @var array<string, mixed> */
    private static array $config = [];
    private static ?PathResolverInterface $paths = null;

    /**
     * @param array<string, mixed> $config
     */
    public static function configure(array $config = [], ?PathResolverInterface $paths = null): void
    {
        self::$config = $config;
        self::$paths = $paths;
        self::$manager = null;
    }

    public static function manager(): Manager
    {
        if (self::$manager === null) {
            self::$manager = new Manager(
                configOverrides: self::$config,
                paths: self::$paths ?? new NativePathResolver(),
            );
        }

        return self::$manager;
    }

    public static function begin(): Builder
    {
        return self::manager()->begin();
    }

    /**
     * @param array<string, mixed> $defaults
     */
    public static function http(array $defaults = []): HttpHandler
    {
        return HttpHandler::make(self::manager(), $defaults);
    }
}
