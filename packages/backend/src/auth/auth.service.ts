import * as crypto from 'node:crypto';
import { hash, argon2id, verify } from 'argon2';
import { ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserResponseDto } from '../users/dto/user.dto.js';
import { CreateAuthDto } from './dto/create-auth.dto.js';
import { AuthResponseDto } from './dto/auth.dto.js';
import { UpdateAuthDto } from './dto/update-auth.dto.js';

@Injectable()
export class AuthService {
  private static readonly ARGON2_OWASP_CONFIGS = [
    { m: 47104, t: 1, p: 1 } /* DO NOT USE WITH ARGON2I */,
    { m: 19456, t: 2, p: 1 } /* DO NOT USE WITH ARGON2I */,
    { m: 12288, t: 3, p: 1 },
    { m: 9216, t: 4, p: 1 },
    { m: 7168, t: 5, p: 1 },
  ];

  private static ARGON2_CONFIG = AuthService.ARGON2_OWASP_CONFIGS[2];

  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private static hashPassword(password: string) {
    return hash(password, {
      type: argon2id,
      memoryCost: AuthService.ARGON2_CONFIG.m,
      timeCost: AuthService.ARGON2_CONFIG.t,
      parallelism: AuthService.ARGON2_CONFIG.p,
      hashLength: 32,
      salt: crypto.randomBytes(16),
    });
  }

  private static verifyPassword(hash: string, password: string) {
    return verify(hash, password);
  }

  async forgeToken(userData: UserResponseDto): Promise<AuthResponseDto> {
    const token = await this.jwtService.signAsync({
      id: userData.id,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      picture: userData.picture,
    });

    return { token };
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<UserResponseDto | null> {
    const user = await this.prismaService.user.findFirst({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        picture: true,
        localCredential: {
          select: {
            hashedPassword: true,
          },
          where: {
            email,
          },
        },
      },
      where: {
        email,
      },
    });

    if (user === null || user.localCredential === null) {
      return null;
    }

    const passwordMatch = await AuthService.verifyPassword(
      user.localCredential.hashedPassword,
      password,
    );
    if (!passwordMatch) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      picture: user.picture,
    };
  }

  async createCredential(dto: CreateAuthDto) {
    const hashedPassword = await AuthService.hashPassword(dto.password);

    try {
      await this.prismaService.localCredential.create({
        data: {
          email: dto.email,
          hashedPassword: hashedPassword,
          user: {
            connectOrCreate: {
              create: {
                email: dto.email,
              },
              where: {
                email: dto.email,
              },
            },
          },
        },
      });
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && 'P2002' === e.code) {
        throw new ConflictException('The email address is already taken');
      }
      throw e;
    }
  }

  async updateCredential(userData: UserResponseDto, dto: UpdateAuthDto) {
    const hashedPassword = await AuthService.hashPassword(dto.password);

    const currentCredential =
      await this.prismaService.localCredential.findUnique({
        where: {
          userId: userData.id,
        },
      });

    if (currentCredential === null) {
      await this.prismaService.localCredential.create({
        data: {
          email: dto.email,
          hashedPassword: hashedPassword,
          user: {
            connect: {
              email: dto.email,
            },
          },
        },
      });
    } else {
      await this.prismaService.localCredential.update({
        where: {
          id: currentCredential.id,
        },
        data: {
          email: dto.email,
          hashedPassword: hashedPassword,
          user: {
            update: {
              email: dto.email,
            },
          },
        },
      });
    }
  }
}
