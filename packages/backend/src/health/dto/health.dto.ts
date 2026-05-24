import { createZodDto } from 'nestjs-zod';
import { HealthSchema } from '@project/shared';

export class HealthResponseDto extends createZodDto(HealthSchema) {}
