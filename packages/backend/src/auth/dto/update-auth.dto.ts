import { createZodDto } from 'nestjs-zod';
import { UpdateAuthSchema } from '@project/shared';

export class UpdateAuthDto extends createZodDto(UpdateAuthSchema) {}
