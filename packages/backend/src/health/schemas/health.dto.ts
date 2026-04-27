import { createZodDto } from 'nestjs-zod';
import { HealthSchema } from './health.schema';

export class HealthResponseDto extends createZodDto(HealthSchema) {}
