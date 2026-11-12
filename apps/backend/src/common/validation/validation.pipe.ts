import { ValidationPipe } from '@nestjs/common';

/**
 * Global validation: unknown properties are rejected (400), payloads are transformed into
 * DTO class instances, and errors go through AllExceptionsFilter as `details`.
 * Implicit conversion is OFF: DTOs convert query strings explicitly (see common/validation/transforms.ts).
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    forbidUnknownValues: true,
    validationError: { target: false, value: false }, // never echo submitted values back
  });
}
