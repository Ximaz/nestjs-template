import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
} from '@nestjs/terminus';
import { CacheService } from '../cache/cache.service.js';
import { QueueCacheService } from '../queue/queue-cache.service.js';
import { PrismaHealthIndicator } from './indicators/prisma.indicator.js';
import { ValkeyHealthIndicator } from './indicators/valkey.indicator.js';

@Controller('health')
@ApiTags('Health Check')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly valkeyIndicator: ValkeyHealthIndicator,
    private readonly cacheService: CacheService,
    private readonly queueCacheService: QueueCacheService,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database'),
      () => this.valkeyIndicator.pingCheck('cache', this.cacheService),
      () =>
        this.valkeyIndicator.pingCheck('queue-cache', this.queueCacheService),
    ]);
  }
}
