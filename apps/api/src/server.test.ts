import { describe, expect, it } from 'vitest';
import { makeTestApp } from './testing/harness';

describe('api health endpoints', () => {
  it('GET /health returns ok', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', service: 'kmkt-api' });
    await app.close();
  });

  it('GET /ready returns ready (database is a declared dependency)', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ready' });
    await app.close();
  });

  it('GET /health/db reports unknown when no probe is wired', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'GET', url: '/health/db' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ dependency: 'database' });
    await app.close();
  });
});
