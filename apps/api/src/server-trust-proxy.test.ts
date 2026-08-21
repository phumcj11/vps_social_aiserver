import { describe, expect, it } from 'vitest';
import { makeTestApp } from './testing/harness';

/**
 * Behind the production reverse proxy (Caddy on 127.0.0.1) the server must honor
 * X-Forwarded-For from the loopback proxy so per-IP auth rate-limiting keys on the
 * real client, not on 127.0.0.1. Fastify is configured with `trustProxy: 'loopback'`
 * (SPRINT 017 deploy). This locks that behavior. The API binds to loopback and is
 * reachable only via the local proxy, so a client cannot spoof the header directly.
 */
describe('reverse-proxy trust (trustProxy: loopback)', () => {
  it('honors X-Forwarded-For from a loopback proxy so req.ip is the real client', async () => {
    const { app } = await makeTestApp();
    // Probe route added before the first inject (instance not yet ready).
    app.get('/__probe_ip', async (req) => ({ ip: req.ip, proto: req.protocol }));

    const forwarded = await app.inject({
      method: 'GET',
      url: '/__probe_ip',
      // light-my-request injects from remoteAddress 127.0.0.1 (loopback → trusted).
      headers: { 'x-forwarded-for': '203.0.113.9', 'x-forwarded-proto': 'https' },
    });
    expect(forwarded.json().ip).toBe('203.0.113.9');
    expect(forwarded.json().proto).toBe('https');

    const direct = await app.inject({ method: 'GET', url: '/__probe_ip' });
    // With no forwarding header, req.ip falls back to the (loopback) remote address.
    expect(direct.json().ip).toBe('127.0.0.1');

    await app.close();
  });
});
