import { Injectable } from '@nestjs/common';
import { HealthResponseDto } from './dto/health.dto.js';

@Injectable()
export class HealthService {
  get(): HealthResponseDto {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
