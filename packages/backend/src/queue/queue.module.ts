import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url = new URL(configService.getOrThrow<string>('QUEUE_URL'));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port) || 6379,
            username: url.username || undefined,
            password: url.password
              ? decodeURIComponent(url.password)
              : undefined,
            db: url.pathname ? Number(url.pathname.replace('/', '')) || 0 : 0,
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
