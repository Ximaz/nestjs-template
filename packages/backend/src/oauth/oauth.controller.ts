import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { OauthService } from './oauth.service.js';
import { CreateOAuthDto } from './dto/create-oauth.dto.js';
import {
  ApiBody,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { OAuthResponseDto } from './dto/oauth.dto.js';
import { CreateOAuthCallbackDto } from './dto/create-oauth-callback.dto.js';
import { AuthResponseDto } from '../auth/dto/auth.dto.js';

@Controller('oauth')
@ApiTags('OAuth')
@ApiTooManyRequestsResponse({
  description:
    'Rate limit exceeded, too many requests in the throttling window.',
})
export class OauthController {
  constructor(private readonly oauthService: OauthService) {}

  @Get('/authorization')
  @ApiOkResponse({
    type: OAuthResponseDto,
  })
  getAuthorizationUrl(@Query() dto: CreateOAuthDto) {
    return this.oauthService.getAuthorizationUrl(dto);
  }

  @Post('/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: AuthResponseDto,
  })
  @ApiBody({
    type: CreateOAuthCallbackDto,
  })
  async callback(
    @Body() dto: CreateOAuthCallbackDto,
  ): Promise<AuthResponseDto> {
    return await this.oauthService.callback(dto);
  }
}
