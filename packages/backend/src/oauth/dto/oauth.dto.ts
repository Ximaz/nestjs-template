import { createZodDto } from 'nestjs-zod';
import { OAuthSchema } from '@react-learning/shared';

export class OAuthResponseDto extends createZodDto(OAuthSchema) {}
