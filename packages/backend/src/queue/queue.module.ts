import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { parseValkeyUrl } from '../config/valkey-url.js';
import { QueueCacheService } from './queue-cache.service.js';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: parseValkeyUrl(
          configService.getOrThrow<string>('QUEUE_URL'),
        ),
      }),
    }),
  ],
  providers: [QueueCacheService],
  exports: [BullModule, QueueCacheService],
})
export class QueueModule {}
