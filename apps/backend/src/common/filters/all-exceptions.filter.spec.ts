import {
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../../config/env.validation';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeFilter(nodeEnv: EnvVars['NODE_ENV']) {
  return new AllExceptionsFilter(new ConfigService<EnvVars, true>({ NODE_ENV: nodeEnv }));
}

function run(filter: AllExceptionsFilter, exception: unknown, headersSent = false) {
  const json = jest.fn<void, [Record<string, unknown>]>();
  const status = jest.fn().mockReturnValue({ json });
  const req = {
    method: 'GET',
    originalUrl: '/x?secret=1',
    url: '/x',
    headers: { 'x-request-id': 'rid-12345678' },
  };
  const res = { status, headersSent };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  filter.catch(exception, host);
  return { status, json, body: json.mock.calls[0]?.[0] as Record<string, unknown> | undefined };
}

describe('AllExceptionsFilter', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('formats an HttpException with a string message', () => {
    const { status, body } = run(makeFilter('production'), new NotFoundException('Sura not found'));
    expect(status).toHaveBeenCalledWith(404);
    expect(body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      message: 'Sura not found',
      requestId: 'rid-12345678',
      path: '/x',
    });
    expect(typeof body?.timestamp).toBe('string');
  });

  it('formats validation errors (message array) as "Validation failed" + details', () => {
    const ex = new BadRequestException(['page must be an integer', 'limit must not exceed 100']);
    const { body } = run(makeFilter('production'), ex);
    expect(body).toMatchObject({
      statusCode: 400,
      message: 'Validation failed',
      details: ['page must be an integer', 'limit must not exceed 100'],
    });
  });

  it('uses the reason phrase for array messages on non-400 errors', () => {
    const ex = new HttpException({ message: ['a', 'b'] }, 422);
    expect(run(makeFilter('production'), ex).body).toMatchObject({
      statusCode: 422,
      message: 'Unprocessable Entity',
      details: ['a', 'b'],
    });
  });

  it('handles HttpException with a plain string response and with an object lacking message', () => {
    expect(run(makeFilter('production'), new HttpException('Nope', 403)).body).toMatchObject({
      statusCode: 403,
      message: 'Nope',
    });
    expect(run(makeFilter('production'), new HttpException({}, 409)).body).toMatchObject({
      statusCode: 409,
      message: 'Conflict',
    });
  });

  it('maps Express middleware errors with a 4xx status (body-parser)', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
    });
    expect(run(makeFilter('production'), tooLarge).body).toMatchObject({
      statusCode: 413,
      error: 'Payload Too Large',
      message: 'request entity too large',
    });
    const hidden = Object.assign(new Error('internal detail'), { status: 400, expose: false });
    expect(run(makeFilter('production'), hidden).body).toMatchObject({ message: 'Bad Request' });
  });

  it('in production hides unexpected error messages and never sends a stack', () => {
    const { status, body } = run(makeFilter('production'), new Error('DB password is hunter2'));
    expect(status).toHaveBeenCalledWith(500);
    expect(body).toMatchObject({ statusCode: 500, message: 'Internal server error' });
    expect(JSON.stringify(body)).not.toMatch(/hunter2|stack|at Object/);
    expect(errorSpy).toHaveBeenCalledTimes(1); // logged server-side with stack
    const [logged] = errorSpy.mock.calls[0] as unknown[];
    expect(String(logged)).toContain('rid=rid-12345678');
  });

  it('in development shows the message but still never sends a stack', () => {
    const { body } = run(makeFilter('development'), new Error('boom detail'));
    expect(body).toMatchObject({ statusCode: 500, message: 'boom detail' });
    expect(body).not.toHaveProperty('stack');
  });

  it('handles non-Error throwables and empty messages', () => {
    expect(run(makeFilter('development'), 'a string').body).toMatchObject({
      message: 'Internal server error',
    });
    expect(run(makeFilter('development'), new Error('')).body).toMatchObject({
      message: 'Internal server error',
    });
  });

  it('keeps intentional 5xx HttpException messages (e.g. 503 search not ready)', () => {
    const ex = new ServiceUnavailableException('Search index is warming up');
    expect(run(makeFilter('production'), ex).body).toMatchObject({
      statusCode: 503,
      message: 'Search index is warming up',
    });
  });

  it('rewrites the router 404 message so the query string is never echoed', () => {
    const { body } = run(makeFilter('production'), new NotFoundException('Cannot GET /x?secret=1'));
    expect(body).toMatchObject({ statusCode: 404, message: 'Cannot GET /x', path: '/x' });
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('does not write when headers were already sent', () => {
    const { status } = run(makeFilter('production'), new NotFoundException(), true);
    expect(status).not.toHaveBeenCalled();
  });
});
