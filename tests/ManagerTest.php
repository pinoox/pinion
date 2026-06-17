<?php

use Pinoox\Pinion\Config;
use Pinoox\Pinion\Manager;
use Pinoox\Pinion\Pinion;
use Pinoox\Pinion\Session;
use Pinoox\Pinion\Store;
use Pinoox\Pinion\Support\NativePathResolver;

beforeEach(function () {
    $dir = sys_get_temp_dir() . '/pinion-test-' . uniqid('', true);
    mkdir($dir, 0777, true);
    $this->tmp = $dir;
});

afterEach(function () {
    if (isset($this->tmp) && is_dir($this->tmp)) {
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($this->tmp, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST,
        );

        foreach ($iterator as $item) {
            $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
        }

        rmdir($this->tmp);
    }
});

it('initializes a pinion session', function () {
    $manager = new Manager(new Store($this->tmp), ['storage_strategy' => 'parts']);

    $result = $manager->init('demo.pinx', 12 * 1024 * 1024, 'out', ['pinx'], 5 * 1024 * 1024);

    expect($result->success)->toBeTrue()
        ->and($result->session->toArray()['protocol'])->toBe(Config::PROTOCOL)
        ->and($result->session->total_chunks)->toBe(3);
});

it('resumes by fingerprint', function () {
    $manager = new Manager(new Store($this->tmp));
    $first = $manager->init('demo.pinx', 1024, 'out', [], null, null, 'fp-123');
    $second = $manager->init('demo.pinx', 1024, 'out', [], null, null, 'fp-123');

    expect($second->resumed)->toBeTrue()
        ->and($second->session->id)->toBe($first->session->id);
});

it('uploads chunks and completes with parts strategy', function () {
    $target = $this->tmp . '/final';
    mkdir($target, 0777, true);

    $manager = new Manager(
        new Store($this->tmp . '/store'),
        ['storage_strategy' => 'parts', 'verify_chunks' => false],
        new NativePathResolver($this->tmp),
    );

    $payload = 'hello-pinion';
    $init = $manager->init('pkg.pinx', strlen($payload), 'final', ['pinx'], 1024);
    $id = $init->session->id;

    expect($manager->receive($id, 0, $payload)->success)->toBeTrue();

    $done = $manager->complete($id);
    expect($done->success)->toBeTrue()
        ->and(file_get_contents($target . '/pkg.pinx'))->toBe($payload);
});

it('reports missing chunk indexes', function () {
    $session = Session::fromArray([
        'id' => '11111111-1111-4111-8111-111111111111',
        'filename' => 'demo.pinx',
        'size' => 100,
        'chunk_size' => 50,
        'total_chunks' => 2,
        'destination' => 'out',
        'extensions' => [],
        'status' => 'pending',
        'bytes_received' => 50,
        'received_indexes' => [0],
        'created_at' => time(),
        'expires_at' => time() + 3600,
    ]);

    expect($session->missingIndexes())->toBe([1]);
});
