import { applyDecorators, HttpCode, SerializeOptions, StandardSchemaValidationPipe } from '@nestjs/common';
import { ApiResponse, type SwaggerDocumentOptions } from '@nestjs/swagger';
import { ErrorCode, errorBodySchema } from '@slotwise/shared';
import type { z } from 'zod';
import { createSchema } from 'zod-openapi';
import { AppError } from './errors.js';

/**
 * Declares a route's response schema once: the serializer strips anything not in it (no leaked hashes or
 * internal fields) and Swagger documents it from the same Zod schema.
 */
export const Returns = (schema: z.ZodType, status = 200) =>
  applyDecorators(
    HttpCode(status),
    SerializeOptions({ schema }),
    ApiResponse({ status, standardSchema: schema }),
    ApiResponse({ status: 'default', description: 'Error', standardSchema: errorBodySchema }),
  );

/** Global input pipe: Zod via Standard Schema. Unknown fields are stripped by Zod objects. */
export const validationPipe = new StandardSchemaValidationPipe({
  exceptionFactory: (issues) => {
    const fields: Record<string, string> = {};
    for (const issue of issues) {
      const path = (issue.path ?? []).map((p) => (typeof p === 'object' ? String(p.key) : String(p))).join('.');
      fields[path || 'request'] ??= issue.message;
    }
    return new AppError(400, ErrorCode.VALIDATION_FAILED, 'Some fields need attention.', fields);
  },
});

/** Turns our Zod schemas into OpenAPI for @nestjs/swagger. */
export const zodConverter: NonNullable<SwaggerDocumentOptions['standardSchemaConverter']> = (schema, { schemaType }) => {
  const s = schema as { _zod?: unknown };
  if (!s._zod) return undefined;
  return createSchema(schema as z.ZodType, { io: schemaType, openapiVersion: '3.0.0' });
};
