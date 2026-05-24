import * as crypto from 'node:crypto';
import * as jose from 'jose';
import { ConfigService } from '@nestjs/config';
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CacheService } from '../cache/cache.service.js';
import { CreateOAuthDto } from './dto/create-oauth.dto.js';
import { OAuthResponseDto } from './dto/oauth.dto.js';
import { CreateOAuthCallbackDto } from './dto/create-oauth-callback.dto.js';
import { UserResponseDto } from '../users/dto/user.dto.js';
import { AuthResponseDto } from '../auth/dto/auth.dto.js';
import { AuthService } from '../auth/auth.service.js';

const OAUTH_STATE_TTL_SECONDS = 300;
const oauthStateKey = (state: string) => `oauth:state:${state}`;

type OauthProvider = {
  oauthUrl: string;
  tokenUrl: string;
  revokeUrl: string;
  jwksUrl: string;
  clientId: string;
  clientSecret: string;
};

type Jwk = {
  alg: string;
  kid: string;
  n: string;
  use: string;
  e: string;
  kty: string;
};

@Injectable()
export class OauthService {
  private readonly logger = new Logger(OauthService.name);

  private OAUTH_PROVIDERS: Record<string, OauthProvider>;

  constructor(
    configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly authService: AuthService,
    private readonly cacheService: CacheService,
  ) {
    this.OAUTH_PROVIDERS = {
      google: {
        oauthUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        revokeUrl: 'https://oauth2.googleapis.com/revoke',
        jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
        clientId: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
        clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      },
    };
  }

  async getAuthorizationUrl(dto: CreateOAuthDto): Promise<OAuthResponseDto> {
    const { provider, redirectUri } = dto;

    if (!(provider in this.OAUTH_PROVIDERS)) {
      throw new BadRequestException(
        `OAuth2.0: ${provider} is not a supported provider`,
      );
    }

    const { oauthUrl, clientId } = this.OAUTH_PROVIDERS[provider];

    const state = crypto.randomBytes(32).toString('hex');
    await this.cacheService.set(
      oauthStateKey(state),
      '1',
      'EX',
      OAUTH_STATE_TTL_SECONDS,
    );

    const authorizationUrl = new URL(oauthUrl);
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'email profile openid');
    authorizationUrl.searchParams.set('state', state);

    return {
      url: authorizationUrl.toString(),
    };
  }

  static async decodeIDToken(
    jwksUrl: OauthProvider['jwksUrl'],
    idToken: string,
  ): Promise<UserResponseDto> {
    const jwksResponse = await fetch(jwksUrl);
    if (jwksResponse.status !== 200) {
      throw new NotFoundException(
        `Unable to fetch the JWKs configuration: ${jwksUrl}`,
      );
    }

    const { keys: jwks } = (await jwksResponse.json()) as { keys: Jwk[] };
    const headers = jose.decodeProtectedHeader(idToken);
    const keyEntry = jwks.find((key) => key.kid === headers.kid);
    if (keyEntry === undefined) {
      throw new BadGatewayException(
        'Unable to find a matching JWK to verify OpenID token.',
      );
    }

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      keyEntry,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['verify'],
    );

    const decodedToken = await jose.jwtVerify(idToken, publicKey);

    const payload = decodedToken.payload as {
      sub: string;
      email: string;
      email_verified: boolean;
      at_hash: string;
      name: string;
      picture: string;
      given_name: string;
      family_name: string;
    };

    if (!payload.email_verified) {
      throw new ForbiddenException(
        'The email address bound to the ID token is not verified.',
      );
    }

    return {
      id: payload.sub,
      email: payload.email,
      firstName: payload.given_name,
      lastName: payload.family_name,
      picture: payload.picture,
    };
  }

  async callback(dto: CreateOAuthCallbackDto): Promise<AuthResponseDto> {
    const { provider, redirectUri, code, state } = dto;

    if (!(provider in this.OAUTH_PROVIDERS)) {
      throw new BadRequestException(
        `OAuth2.0: ${provider} is not a supported provider`,
      );
    }

    const consumed = await this.cacheService.del(oauthStateKey(state));
    if (consumed === 0) {
      throw new UnauthorizedException(
        'OAuth2.0: invalid or expired state parameter',
      );
    }

    const { tokenUrl, jwksUrl, clientId, clientSecret } =
      this.OAUTH_PROVIDERS[provider];

    const body = new URLSearchParams({
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const callbackResponse = await fetch(tokenUrl, {
      method: 'POST',
      body: body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (callbackResponse.status !== 200) {
      const error = await callbackResponse.text();
      this.logger.error(
        'Unable to exchange the code for valid OAuth2.0 credentials',
        error,
      );
      throw new BadRequestException(
        'Unable to exchange the code for valid OAuth2.0 credentials',
      );
    }

    const data = (await callbackResponse.json()) as {
      access_token: string;
      id_token: string;
    };

    await this.revoke(provider, data.access_token);

    const user = await OauthService.decodeIDToken(jwksUrl, data.id_token);

    const currentOAuth = await this.prismaService.oAuthCredential.findUnique({
      select: {
        id: true,
        userId: true,
      },
      where: {
        provider_sub: {
          provider: provider,
          sub: user.id,
        },
      },
    });

    if (currentOAuth === null) {
      const currentUser = await this.prismaService.user.findUnique({
        where: {
          email: user.email,
        },
        select: {
          id: true,
        },
      });

      if (currentUser === null) {
        const createdUser = await this.prismaService.user.create({
          data: {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            picture: user.picture,
            oauthCredential: {
              create: {
                provider: provider,
                sub: user.id,
                email: user.email,
              },
            },
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            picture: true,
          },
        });

        return await this.authService.forgeToken(createdUser);
      }

      const createdOAuth = await this.prismaService.oAuthCredential.create({
        select: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              picture: true,
            },
          },
        },
        data: {
          provider: provider,
          sub: user.id,
          email: user.email,
          user: {
            connect: {
              id: currentUser.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              picture: user.picture,
            },
          },
        },
      });

      return await this.authService.forgeToken(createdOAuth.user);
    }

    const updatedOAuth = await this.prismaService.oAuthCredential.update({
      where: {
        id: currentOAuth.id,
      },
      data: {
        email: user.email,
        user: {
          update: {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            picture: user.picture,
          },
        },
      },
      select: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            picture: true,
          },
        },
      },
    });

    return await this.authService.forgeToken(updatedOAuth.user);
  }

  private async revoke(provider: string, accessToken: string) {
    const { revokeUrl } = this.OAUTH_PROVIDERS[provider];

    const body = new URLSearchParams({
      token: accessToken,
    });
    const response = await fetch(revokeUrl, {
      method: 'POST',
      body: body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (response.status !== 200) {
      const error = await response.text();
      this.logger.error(
        `Unable to revoke the access token from ${provider}.`,
        error,
      );
    }
  }
}
