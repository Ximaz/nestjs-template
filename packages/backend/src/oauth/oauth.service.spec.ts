import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OauthService } from './oauth.service.js';

describe('OauthService', () => {
  let service: OauthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OauthService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              switch (key) {
                case 'JWT_DURATION':
                  return '1h';
                case 'JWT_SECRET':
                  return 'test-secret';
                case 'GOOGLE_CLIENT_ID':
                  return '<id>.apps.googleusercontent.com';
                case 'GOOGLE_CLIENT_SECRET':
                  return 'GOCSPX-<secret>';
                default:
                  throw new Error(`No value found for ${key}`);
              }
            },
          },
        },
        { provide: PrismaService, useValue: {} },
        { provide: AuthService, useValue: {} },
      ],
    }).compile();

    service = module.get<OauthService>(OauthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
