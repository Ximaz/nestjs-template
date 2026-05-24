import { createZodDto } from 'nestjs-zod';
import { OAuthSchema } from '@project/shared';

export class OAuthResponseDto extends createZodDto(OAuthSchema) {}
