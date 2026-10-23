import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("API");
  catch(error: any, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse();
    const requestId = context.getRequest().requestId || randomUUID();
    let status = 500;
    let message: string | string[] = "Something went wrong. Please try again.";
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      message =
        typeof body === "string"
          ? body
          : (body as { message: string | string[] }).message;
    } else if (error?.code === "23505") {
      status = 409;
      message = "This record already exists.";
    } else if (error?.name === "EntityNotFoundError") {
      status = 404;
      message = "Record not found.";
    }
    if (status === 500)
      this.logger.error(
        JSON.stringify({
          requestId,
          errorType: error?.name || "UnknownError",
          code: error?.code,
        }),
      );
    response.status(status).json({ statusCode: status, message, requestId });
  }
}
