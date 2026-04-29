import { createZodDto } from 'nestjs-zod';
import { CreateAuthSchema } from '@react-learning/shared';

export class CreateAuthDto extends createZodDto(CreateAuthSchema) {}
