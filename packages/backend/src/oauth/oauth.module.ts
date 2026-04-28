import { Module } from '@nestjs/common';
import { OauthController } from './oauth.controller.js';
import { OauthService } from './oauth.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OauthController],
  providers: [OauthService],
})
export class OauthModule {}
