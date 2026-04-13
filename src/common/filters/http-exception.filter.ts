// RUTA: src/common/filters/http-exception.filter.ts

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawMessage =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Error interno del servidor.';

    // Loguear errores 500 en el servidor (stack incluido), sin exponer al cliente
    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      // Raw console.error para entornos donde el Logger de NestJS no sea visible
      // (Neon logs, Railway, Render, etc.)
      console.error('══════════════════════ SERVER ERROR ══════════════════════');
      console.error(`Path  : ${request.method} ${request.url}`);
      console.error(`Error :`, exception);
      if (exception instanceof Error) {
        console.error(`Stack :`, exception.stack);
        const e = exception as any;
        if (e.code)   console.error(`Prisma code :`, e.code);
        if (e.meta)   console.error(`Prisma meta :`, JSON.stringify(e.meta));
        if (e.message) console.error(`Message     :`, e.message);
      }
      console.error('══════════════════════════════════════════════════════════');
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      // Para 5xx devolvemos un mensaje genérico; para 4xx el mensaje original
      message:
        status >= 500
          ? 'Error interno del servidor. Por favor intenta de nuevo.'
          : rawMessage,
    });
  }
}
