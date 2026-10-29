<?php

declare(strict_types=1);

namespace App\Services;

use RuntimeException;

/** A refused or failed Resend send; $permanent means retrying the same email cannot succeed. */
final class ResendError extends RuntimeException
{
    public function __construct(string $message, public readonly int $httpStatus, public readonly bool $permanent)
    {
        parent::__construct($message);
    }
}
