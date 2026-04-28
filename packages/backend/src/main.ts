import { constants } from 'node:zlib';
import { NestFactory } from '@nestjs/core';
import {
  NestFastifyApplication,
  FastifyAdapter,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { cleanupOpenApiDoc, ZodValidationPipe } from 'nestjs-zod';
import fastifyMultipart from '@fastify/multipart';
import fastifyCompress from '@fastify/compress';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(fastifyCompress, {
    brotliOptions: { params: { [constants.BROTLI_PARAM_QUALITY]: 1 } },
  });

  await app.register(fastifyMultipart);

  const config = new DocumentBuilder()
    .setTitle('React Learning')
    .setDescription('The Backend API for my React learning journey')
    .setVersion('1.0')
    .addTag('Health Check', 'All the health-check-related endpoints')
    .build();
  const documentFactory = () =>
    cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('openapi', app, documentFactory);

  await app.init();

  app.setGlobalPrefix('api', {
    exclude: ['openapi', 'health'],
  });

  app.useGlobalPipes(new ZodValidationPipe());

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

bootstrap().catch(console.error);
