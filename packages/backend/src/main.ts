import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { cleanupOpenApiDoc, ZodValidationPipe } from 'nestjs-zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('React Learning')
    .setDescription('The Backend API for my React learning journey')
    .setVersion('1.0')
    .addTag('Health Check', 'All the health-check-related endpoints')
    .build();
  const documentFactory = () =>
    cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('openapi', app, documentFactory);

  app.setGlobalPrefix('api', {
    exclude: ['openapi', ''],
  });

  app.useGlobalPipes(new ZodValidationPipe());

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch(console.error);
