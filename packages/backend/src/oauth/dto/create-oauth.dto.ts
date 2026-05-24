import { createZodDto } from 'nestjs-zod';
import { CreateOAuthSchema } from '@project/shared';

export class CreateOAuthDto extends createZodDto(CreateOAuthSchema) {}
