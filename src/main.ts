import "dotenv/config";
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { ApiErrorFilter } from "./modules/shared/error.filter";
import { randomUUID } from "node:crypto";

async function bootstrap() {
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET === "replace-this-before-production"
  )
    throw new Error("JWT_SECRET must have at least 32 characters.");
  if (!process.env.DATABASE_URL?.startsWith("postgres"))
    throw new Error("Configure a PostgreSQL DATABASE_URL.");
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets("uploads", { prefix: "/uploads" });
  const origins = (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((x) => x.trim());
  const localDevelopmentOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
  app.use(helmet());
  app.use((request: any, response: any, next: () => void) => {
    request.requestId = randomUUID();
    response.setHeader("X-Request-ID", request.requestId);
    next();
  });
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void,
    ) =>
      callback(
        null,
        !origin ||
          origins.includes(origin) ||
          (process.env.NODE_ENV !== "production" &&
            localDevelopmentOrigin.test(origin)),
      ),
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(Number(process.env.PORT || 4000), "0.0.0.0");
}
bootstrap();
