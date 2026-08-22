import { describe, expect, it } from 'vitest';
import { makeTestApp } from './testing/harness';

/**
 * Regression: the browser blocks the Business/Property policy save because the
 * CORS preflight for the PUT method was not allowed. `putBusinessPolicies` is a
 * PUT; if `Access-Control-Allow-Methods` omits PUT, the browser refuses the real
 * request and the owner only sees a generic "บันทึกไม่สำเร็จ". Every method the
 * API actually serves (incl. PUT and DELETE) must be advertised to the browser.
 */
describe('CORS allowed methods (owner policy save regression)', () => {
  it('advertises PUT (and DELETE) in the preflight so PUT policy saves are not blocked', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/businesses/00000000-0000-0000-0000-000000000000/policies',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    });
    // Preflight succeeds and echoes the single allowed origin (never a wildcard).
    expect([200, 204]).toContain(res.statusCode);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const allowed = String(res.headers['access-control-allow-methods'] ?? '')
      .split(',')
      .map((m) => m.trim().toUpperCase());
    expect(allowed).toContain('PUT');
    expect(allowed).toContain('DELETE');
    expect(allowed).toContain('PATCH');
    expect(allowed).toContain('POST');
    await app.close();
  });
});
