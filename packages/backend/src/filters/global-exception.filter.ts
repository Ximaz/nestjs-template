import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const request = ctx.getRequest<FastifyRequest>();
    const response = ctx.getResponse<FastifyReply>();

    if (request.url === '/favicon.ico') {
      response.status(404).send();
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();

      this.logger.error(
        { err: exception, statusCode: status, path: request.url },
        exception.message,
      );

      response.status(status).send({
        statusCode: status,
        message: exception.message,
      });

      return;
    }

    this.logger.error(
      { err: exception, path: request.url, method: request.method },
      'Unhandled exception',
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: 500,
      message: 'Internal server error',
    });
  }
}
