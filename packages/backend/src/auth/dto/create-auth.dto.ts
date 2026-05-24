import { createZodDto } from 'nestjs-zod';
import { CreateAuthSchema } from '@project/shared';

export class CreateAuthDto extends createZodDto(CreateAuthSchema) {}
