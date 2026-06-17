<?php

return [
    'protocol' => 'pinion',
    'protocol_version' => 2,
    'chunk_size' => 5 * 1024 * 1024,
    'min_chunk_size' => 1024 * 1024,
    'max_chunk_size' => 10 * 1024 * 1024,
    'ttl' => 86400,
    'max_file_size' => 2 * 1024 * 1024 * 1024,
    'storage_path' => sys_get_temp_dir() . '/pinion',
    'storage_strategy' => 'parts',
    'verify_chunks' => true,
    'verify_file_hash' => false,
];
