import { createZodDto } from 'nestjs-zod';
import { CreateOAuthSchema } from '@react-learning/shared';

export class CreateOAuthDto extends createZodDto(CreateOAuthSchema) {}
