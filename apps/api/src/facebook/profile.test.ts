import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProfileService } from './profile';
import { FacebookError, FacebookErrorCode } from './errors';

const roots: string[] = [];
function tmpRoot(): string {
  const r = mkdtempSync(join(tmpdir(), 'kmkt-prof-'));
  roots.push(r);
  return r;
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe('ProfileService', () => {
  it('generates a safe relative path from a workspace UUID', () => {
    const svc = new ProfileService(tmpRoot());
    const ws = randomUUID();
    expect(svc.relativePath(ws)).toBe(`${ws}/facebook`);
  });

  it('rejects path-traversal / non-UUID workspace ids', () => {
    const svc = new ProfileService(tmpRoot());
    for (const bad of ['../../etc/passwd', 'not-a-uuid', 'a/b', '..', '', 'x'.repeat(36)]) {
      expect(() => svc.assertWorkspaceId(bad)).toThrow(FacebookError);
      try {
        svc.relativePath(bad);
        throw new Error('should have thrown');
      } catch (e) {
        expect((e as FacebookError).code).toBe(FacebookErrorCode.INVALID_WORKSPACE);
      }
    }
  });

  it('creates the profile directory and reports existence', async () => {
    const svc = new ProfileService(tmpRoot());
    const ws = randomUUID();
    expect(await svc.profileExists(ws)).toBe(false);
    await svc.ensureProfileDir(ws);
    expect(await svc.profileExists(ws)).toBe(true);
  });

  it('keeps one workspace profile isolated from another', async () => {
    const root = tmpRoot();
    const svc = new ProfileService(root);
    const a = randomUUID();
    const b = randomUUID();
    await svc.ensureProfileDir(a);
    await svc.ensureProfileDir(b);
    // Deleting A must not affect B.
    await svc.deleteProfile(a);
    expect(await svc.profileExists(a)).toBe(false);
    expect(await svc.profileExists(b)).toBe(true);
  });

  it('cleans up a profile successfully', async () => {
    const svc = new ProfileService(tmpRoot());
    const ws = randomUUID();
    const dir = await svc.ensureProfileDir(ws);
    writeFileSync(join(dir, 'cookies-fake'), 'x');
    await svc.deleteProfile(ws);
    expect(existsSync(dir)).toBe(false);
  });

  it('enforces an exclusive lock (PROFILE_LOCKED while held)', async () => {
    const svc = new ProfileService(tmpRoot());
    const ws = randomUUID();
    await svc.acquireLock(ws);
    await expect(svc.acquireLock(ws)).rejects.toMatchObject({
      code: FacebookErrorCode.PROFILE_LOCKED,
    });
    await svc.releaseLock(ws);
    // After release it can be acquired again.
    await expect(svc.acquireLock(ws)).resolves.toBeUndefined();
  });
});
