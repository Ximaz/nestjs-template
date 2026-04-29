import * as crypto from 'node:crypto';
import { hash, argon2id, verify } from 'argon2';
import ms, { StringValue } from 'ms';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserResponseDto } from '../users/dto/user.dto.js';
import { CreateAuthDto } from './dto/create-auth.dto.js';
import { VerifyAuthDto } from './dto/verify-auth.dto.js';
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

  private readonly JWT_SECRET: string;
  private readonly JWT_DURATION: number;

  constructor(
    configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    this.JWT_SECRET = configService.getOrThrow<string>('JWT_SECRET');
    this.JWT_DURATION = ms(
      configService.getOrThrow<StringValue>('JWT_DURATION'),
    );
  }

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
    const token = await this.jwtService.signAsync(
      {
        id: userData.id,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        picture: userData.picture,
      },
      {
        secret: this.JWT_SECRET,
        expiresIn: this.JWT_DURATION / 1000,
      },
    );

    return { token: token };
  }

  async verifyToken(token: string) {
    const tokenData = await this.jwtService.verifyAsync<UserResponseDto>(
      token,
      {
        secret: this.JWT_SECRET,
        ignoreExpiration: false,
      },
    );

    return tokenData;
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

  async verifyCredential(dto: VerifyAuthDto): Promise<AuthResponseDto> {
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
            email: dto.email,
          },
        },
      },
      where: {
        email: dto.email,
      },
    });
    if (user === null || user.localCredential === null) {
      throw new UnauthorizedException('Invalid email address and/or password');
    }

    const passwordMatch = await AuthService.verifyPassword(
      user.localCredential.hashedPassword,
      dto.password,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid email address and/or password');
    }

    return await this.forgeToken(user);
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
