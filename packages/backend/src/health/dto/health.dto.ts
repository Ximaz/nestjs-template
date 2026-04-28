import { createZodDto } from 'nestjs-zod';
import { HealthSchema } from '@react-learning/shared';

export class HealthResponseDto extends createZodDto(HealthSchema) {}
