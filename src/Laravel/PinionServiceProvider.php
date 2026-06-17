<?php

namespace Pinoox\Pinion\Laravel;

use Illuminate\Support\ServiceProvider;
use Pinoox\Pinion\HttpHandler;
use Pinoox\Pinion\Manager;
use Pinoox\Pinion\Pinion;
use Pinoox\Pinion\Support\NativePathResolver;

class PinionServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__ . '/../../config/pinion.php', 'pinion');

        $this->app->singleton(Manager::class, function ($app) {
            $config = $app['config']->get('pinion', []);
            $base = $app->basePath();
            $resolver = new NativePathResolver($base);

            Pinion::configure($config, $resolver);

            return Pinion::manager();
        });

        $this->app->singleton(HttpHandler::class, function ($app) {
            return Pinion::http($app['config']->get('pinion.defaults', []));
        });
    }

    public function boot(): void
    {
        $this->publishes([
            __DIR__ . '/../../config/pinion.php' => config_path('pinion.php'),
        ], 'pinion-config');
    }
}
