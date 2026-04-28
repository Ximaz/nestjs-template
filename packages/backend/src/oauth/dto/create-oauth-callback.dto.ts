import { createZodDto } from 'nestjs-zod';
import { CreateOAuthCallbackSchema } from '@react-learning/shared';

export class CreateOAuthCallbackDto extends createZodDto(
  CreateOAuthCallbackSchema,
) {}
