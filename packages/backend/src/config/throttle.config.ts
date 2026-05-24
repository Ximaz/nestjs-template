import { ThrottlerOptions } from '@nestjs/throttler';

export const ThrottleLimits = {
  default: { ttl: 60_000, limit: 100 },
  auth: { ttl: 60_000, limit: 5 },
} as const satisfies Record<string, Pick<ThrottlerOptions, 'ttl' | 'limit'>>;
