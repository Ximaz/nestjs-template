import { createZodDto } from 'nestjs-zod';
import { VerifyAuthSchema } from '@project/shared';

export class VerifyAuthDto extends createZodDto(VerifyAuthSchema) {}
