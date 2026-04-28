import { createZodDto } from 'nestjs-zod';
import { AuthSchema } from '@react-learning/shared';

export class AuthResponseDto extends createZodDto(AuthSchema) {}
