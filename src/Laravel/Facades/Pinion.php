<?php

namespace Pinoox\Pinion\Laravel\Facades;

use Illuminate\Support\Facades\Facade;
use Pinoox\Pinion\Builder;
use Pinoox\Pinion\HttpHandler;
use Pinoox\Pinion\Manager;

/**
 * @method static Builder begin()
 * @method static Manager manager()
 * @method static HttpHandler http(array $defaults = [])
 *
 * @see \Pinoox\Pinion\Pinion
 */
class Pinion extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return Manager::class;
    }
}
