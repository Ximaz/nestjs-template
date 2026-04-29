import { createZodDto } from 'nestjs-zod';
import { UserSchema } from '@react-learning/shared';

export class UserResponseDto extends createZodDto(UserSchema) {}
