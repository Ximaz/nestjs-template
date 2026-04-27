import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { HealthResponseDto } from './schemas/health.dto';

@Controller('health')
@ApiTags('Health Check')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ type: HealthResponseDto })
  get(): HealthResponseDto {
    return this.healthService.get();
  }
}
