import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis as Valkey } from 'iovalkey';
import { parseValkeyUrl } from '../config/valkey-url.js';

@Injectable()
export class QueueCacheService extends Valkey implements OnModuleDestroy {
  private readonly logger = new Logger(QueueCacheService.name);

  constructor(configService: ConfigService) {
    super({
      ...parseValkeyUrl(configService.getOrThrow<string>('QUEUE_URL')),
      maxRetriesPerRequest: null,
    });
    this.on('connect', () => this.logger.log('Connected to queue-cache'));
    this.on('error', (err) => this.logger.error(err.message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}
