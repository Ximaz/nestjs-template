import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../prisma/prisma.module.js';
import { HealthController } from './health.controller.js';
import { PrismaHealthIndicator } from './indicators/prisma.indicator.js';
import { ValkeyHealthIndicator } from './indicators/valkey.indicator.js';

@Module({
  imports: [TerminusModule, PrismaModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, ValkeyHealthIndicator],
})
export class HealthModule {}
