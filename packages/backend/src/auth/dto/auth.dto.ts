import { createZodDto } from 'nestjs-zod';
import { AuthSchema } from '@project/shared';

export class AuthResponseDto extends createZodDto(AuthSchema) {}
