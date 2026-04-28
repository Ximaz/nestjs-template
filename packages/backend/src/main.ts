import { constants } from 'node:zlib';
import fastifyMultipart from '@fastify/multipart';
import fastifyCompress from '@fastify/compress';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  NestFastifyApplication,
  FastifyAdapter,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { cleanupOpenApiDoc, ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(fastifyCompress, {
    global: false,
    brotliOptions: { params: { [constants.BROTLI_PARAM_QUALITY]: 1 } },
  });

  await app.register(fastifyMultipart);

  app.setGlobalPrefix('api', {
    exclude: ['openapi', 'health'],
  });

  app.useGlobalPipes(new ZodValidationPipe());

  app.useGlobalFilters(new GlobalExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('React Learning')
    .setDescription('The Backend API for my React learning journey')
    .setVersion('1.0')
    .addTag('Health Check', 'All the health-check-related endpoints')
    .addTag('Auth', 'All the authentication endpoints (local credentials)')
    .addTag('OAuth', 'All the OAuth2.0 endpoints (OAuth2.0 credentials)')
    .addBearerAuth(
      {
        type: 'http',
        description: "A JWT returned by the 'auth' or 'oauth' endpoints.",
        name: 'bearer',
      },
      'jwt',
    )
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('openapi', app, document, {
    explorer: true,
    customSiteTitle: config.info.title,
  });

  const configService = app.get(ConfigService);

  const PORT = configService.get<number>('PORT') ?? 3000;

  await app.init();

  await app.listen(PORT, '0.0.0.0');
}

bootstrap().catch(console.error);
