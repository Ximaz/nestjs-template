import { createZodDto } from 'nestjs-zod';
import { CreateOAuthCallbackSchema } from '@project/shared';

export class CreateOAuthCallbackDto extends createZodDto(
  CreateOAuthCallbackSchema,
) {}
