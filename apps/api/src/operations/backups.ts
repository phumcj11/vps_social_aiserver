import { promises as fs } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';

/**
 * Backup metadata reader (SPRINT 013).
 *
 * The backup scripts (`scripts/backup/*.mjs`) write, alongside each compressed
 * archive, a `*.manifest.json` describing the backup with SAFE fields only —
 * never credentials, never absolute host paths, never content. The API reads
 * those manifests to report backup age and inventory. This module NEVER reads
 * the archive bodies and never surfaces a secret.
 */

export interface BackupManifest {
  kind: 'database' | 'config' | 'audit';
  createdAt: string; // ISO
  file: string; // archive basename (relative)
  bytes: number;
  sha256: string;
  appVersion?: string;
  gitCommit?: string;
  gitTag?: string;
  schemaMigration?: string;
}

export interface BackupSummary extends BackupManifest {
  manifestFile: string; // basename only
  ageHours: number;
}

function backupRootPath(backupRoot: string): string {
  return isAbsolute(backupRoot) ? backupRoot : resolve(process.cwd(), backupRoot);
}

/** List backup manifests (newest first). Missing dir → empty list, no throw. */
export async function listBackups(
  backupRoot: string,
  now: Date = new Date(),
): Promise<BackupSummary[]> {
  const root = backupRootPath(backupRoot);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }
  const manifests = entries.filter((e) => e.endsWith('.manifest.json'));
  const out: BackupSummary[] = [];
  for (const m of manifests) {
    try {
      const raw = await fs.readFile(join(root, m), 'utf8');
      const parsed = JSON.parse(raw) as BackupManifest;
      const ageMs = now.getTime() - new Date(parsed.createdAt).getTime();
      out.push({
        ...parsed,
        manifestFile: m,
        ageHours: Math.max(0, Math.round((ageMs / 3_600_000) * 10) / 10),
      });
    } catch {
      // Skip an unreadable/corrupt manifest — never throw for a bad file.
    }
  }
  return out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Age (hours) of the newest backup of any kind, or null if none. */
export async function newestBackupAgeHours(
  backupRoot: string,
  now: Date = new Date(),
): Promise<number | null> {
  const all = await listBackups(backupRoot, now);
  return all.length > 0 ? (all[0]!.ageHours ?? null) : null;
}
