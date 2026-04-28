import { createZodDto } from 'nestjs-zod';
import { VerifyAuthSchema } from '@react-learning/shared';

export class VerifyAuthDto extends createZodDto(VerifyAuthSchema) {}
