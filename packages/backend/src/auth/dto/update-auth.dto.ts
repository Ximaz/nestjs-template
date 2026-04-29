import { createZodDto } from 'nestjs-zod';
import { UpdateAuthSchema } from '@react-learning/shared';

export class UpdateAuthDto extends createZodDto(UpdateAuthSchema) {}
