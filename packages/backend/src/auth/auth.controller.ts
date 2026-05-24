import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import { AuthResponseDto } from './dto/auth.dto.js';
import { CreateAuthDto } from './dto/create-auth.dto.js';
import { VerifyAuthDto } from './dto/verify-auth.dto.js';
import { UpdateAuthDto } from './dto/update-auth.dto.js';
import { UserResponseDto } from '../users/dto/user.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/register')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({
    type: CreateAuthDto,
  })
  @ApiConflictResponse({
    description: 'The email address is already taken',
  })
  async createCredential(@Body() dto: CreateAuthDto) {
    return await this.authService.createCredential(dto);
  }

  @Post('/login')
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    type: VerifyAuthDto,
  })
  @ApiResponse({
    type: AuthResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'The provided credential is invalid',
  })
  async login(@Req() req: FastifyRequest): Promise<AuthResponseDto> {
    const user = req['user'] as UserResponseDto;
    return await this.authService.forgeToken(user);
  }

  @Put('/update-credential')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({
    type: UpdateAuthDto,
  })
  @ApiBearerAuth('jwt')
  @ApiUnauthorizedResponse({
    description:
      'The client is trying to access the route without being authenticated',
  })
  async updateCredential(
    @Req() req: FastifyRequest,
    @Body() dto: UpdateAuthDto,
  ) {
    const userData = req['user'] as UserResponseDto;
    return await this.authService.updateCredential(userData, dto);
  }
}
