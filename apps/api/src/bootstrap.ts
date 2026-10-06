import 'reflect-metadata';
import { type INestApplication, Logger, StandardSchemaSerializerInterceptor } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErrorCode, type ErrorBody } from '@slotwise/shared';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { ErrorFilter } from './common/errors.js';
import { makeLogger } from './common/logger.js';
import { requestIdMiddleware } from './common/request-context.js';
import { validationPipe, zodConverter } from './common/schema.js';
import type { AppConfig } from './config.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PUBLIC_PREFIX = '/api/v1/public/';

const requestOrigin = (req: Request): string | undefined => {
  const origin = req.get('origin');
  if (origin) return origin;
  try {
    return new URL(req.get('referer') ?? '').origin;
  } catch {
    return undefined;
  }
};

/** Shared by src/main.ts and the tests, so both run exactly the same middleware. */
export const createApp = async (config: AppConfig): Promise<INestApplication> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forConfig(config), {
    logger: makeLogger(config.NODE_ENV),
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: '100kb' });
  app.set('trust proxy', 'loopback'); // nginx on the same host
  app.disable('x-powered-by');
  app.use(requestIdMiddleware);

  // The widget runs on customers' own sites: public routes allow any origin, without cookies.
  // Everything else is same-origin only (the dashboard calls through the Next.js /api rewrite).
  app.enableCors((req: Request, cb: (err: Error | null, opts: object) => void) =>
    cb(null, req.path.startsWith(PUBLIC_PREFIX) ? { origin: '*', credentials: false, maxAge: 600 } : { origin: false }),
  );

  const webOrigin = new URL(config.WEB_URL).origin;
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!req.path.startsWith('/api/docs')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    }
    // CSRF: cookie-authenticated writes must come from the dashboard's own origin.
    // Public routes use no cookies; API-key requests carry their own credential.
    const needsOrigin =
      !SAFE_METHODS.has(req.method) && !req.path.startsWith(PUBLIC_PREFIX) && !req.get('authorization');
    if (needsOrigin && requestOrigin(req) !== webOrigin) {
      res.status(403).json({
        statusCode: 403,
        errorCode: ErrorCode.BAD_ORIGIN,
        message: 'This request didn’t come from the Slotwise dashboard.',
      } satisfies ErrorBody);
      return;
    }
    next();
  });

  if (config.NODE_ENV !== 'test') {
    const log = new Logger('Http');
    app.use((req: Request, res: Response, next: NextFunction) => {
      const started = Date.now();
      // Method, route pattern, status and time only: never bodies, query strings or tokens.
      res.on('finish', () => {
        if (req.path === '/api/health') return;
        const route = (req.route as { path?: string } | undefined)?.path ?? 'unmatched';
        log.log(`${req.method} ${route} ${res.statusCode} ${Date.now() - started}ms`);
      });
      next();
    });
  }

  app.setGlobalPrefix('api');
  app.useGlobalPipes(validationPipe);
  app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new ErrorFilter());

  const docConfig = new DocumentBuilder()
    .setTitle('Slotwise API')
    .setDescription(
      'Booking engine API. Authenticate with `Authorization: Bearer sw_live_…` (API keys are created in the dashboard). ' +
        'Every error has a stable `errorCode`. Booking create and reschedule require an `Idempotency-Key` header.',
    )
    .setVersion('1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'API key: sw_live_…' })
    .build();
  const document = SwaggerModule.createDocument(app, docConfig, { standardSchemaConverter: zodConverter });
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/openapi.json' });

  app.enableShutdownHooks();
  return app;
};
