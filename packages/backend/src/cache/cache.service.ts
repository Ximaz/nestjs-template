import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis as Valkey } from 'iovalkey';

@Injectable()
export class CacheService extends Valkey implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);

  constructor(configService: ConfigService) {
    super(configService.getOrThrow<string>('CACHE_URL'));
    this.on('connect', () => this.logger.log('Connected to Valkey'));
    this.on('error', (err) => this.logger.error(err.message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}
