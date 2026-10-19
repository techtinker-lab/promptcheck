import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Fastify Application Security & HTTP Specs', () => {
  const app = buildApp();

  it('serves /healthz with status 200 ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('rejects CLI requests without Bearer Project Token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cli/contracts',
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('INVALID_PROJECT_TOKEN');
  });

  it('rejects CLI requests with invalid token prefix', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cli/contracts',
      headers: {
        authorization: 'Bearer invalid_token_format',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe('INVALID_PROJECT_TOKEN');
  });

  it('enforces CORS policies', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/healthz',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
