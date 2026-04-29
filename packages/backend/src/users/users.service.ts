import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserResponseDto } from './dto/user.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async getMe(id: UserResponseDto['id']): Promise<UserResponseDto> {
    const currentUser = await this.prismaService.user.findUnique({
      where: {
        id: id,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        picture: true,
      },
    });

    if (currentUser === null) {
      throw new NotFoundException();
    }

    return currentUser;
  }
}
