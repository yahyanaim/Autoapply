import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { loadRootModule } from './root-module.loader';

async function bootstrap() {
  const rootModule = await loadRootModule();
  const app = await NestFactory.create<NestExpressApplication>(rootModule, {
    bufferLogs: process.env.CAREER_CHAT_STANDALONE !== 'true',
    rawBody: true,
  });

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const isProduction = config.get('NODE_ENV') === 'production';
  const trustProxyHops = config.get<number>('TRUST_PROXY_HOPS', 0);
  if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);

  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              baseUri: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              formAction: ["'self'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      hsts: isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      noSniff: true,
    }),
  );
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
    next();
  });
  app.use(cookieParser());

  const allowedOrigins = new Set(
    [
      config.get<string>('DASHBOARD_URL', 'http://localhost:3000'),
      ...(config.get<string>('CORS_ALLOWED_ORIGINS', '') || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      config.get<string>('EXTENSION_ID')
        ? `chrome-extension://${config.get<string>('EXTENSION_ID')}`
        : '',
    ].filter(Boolean),
  );
  app.enableCors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) callback(null, true);
      else callback(new Error('Origin is not allowed by CORS'), false);
    },
    credentials: true,
    exposedHeaders: ['X-Request-ID'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ApplyAI API')
      .setDescription('ApplyAI API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get<number>('PORT', 3001);
  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');
  logger.log(`Application running on port ${port}`);
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
