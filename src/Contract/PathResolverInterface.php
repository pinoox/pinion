<?php

namespace Pinoox\Pinion\Contract;

interface PathResolverInterface
{
    public function resolve(string $reference): string;
}
