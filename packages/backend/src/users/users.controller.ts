import { type FastifyRequest } from 'fastify';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UsersService } from './users.service.js';
import { UserResponseDto } from './dto/user.dto.js';

@Controller('users')
@ApiTags('Users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
@ApiUnauthorizedResponse({
  description:
    'The client is trying to access the route without being authenticated',
})
@ApiTooManyRequestsResponse({
  description:
    'Rate limit exceeded, too many requests in the throttling window.',
})
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiResponse({
    type: UserResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      'The user might have been deleted between the beginning of the session and this request',
  })
  async me(@Req() req: FastifyRequest) {
    const userData = req['user'] as UserResponseDto;

    return await this.usersService.getMe(userData.id);
  }
}
