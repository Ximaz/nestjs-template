import { createZodDto } from 'nestjs-zod';
import { UserSchema } from '@project/shared';

export class UserResponseDto extends createZodDto(UserSchema) {}
