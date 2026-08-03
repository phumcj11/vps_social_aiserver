import { promises as fs } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';

/**
 * Persistent operational-state store (SPRINT 013).
 *
 * Maintenance Mode and Incident Lockdown must survive a process restart and must
 * be readable even when the database is down (health/backup/restore still work),
 * so state lives in a small JSON file — NOT only process memory and NOT only
 * `.env`. Writes are atomic (temp file + rename). The file contains no secrets:
 * only booleans, timestamps, operator identity, and a bounded audit history.
 *
 * The kill switch and write flags are NOT stored here — those remain in
 * configuration. This store only toggles the two operator-controlled runtime
 * modes and records who changed them and why.
 */

export interface ModeState {
  enabled: boolean;
  since: string | null; // ISO timestamp when last enabled
  reason: string | null;
  operator: string | null;
}

export interface OperationalStateHistoryEntry {
  at: string;
  mode: 'maintenance' | 'lockdown';
  action: 'enable' | 'disable';
  operator: string;
  reason: string;
}

export interface OperationalState {
  maintenance: ModeState;
  lockdown: ModeState;
  history: OperationalStateHistoryEntry[];
  updatedAt: string | null;
}

const EMPTY_MODE: ModeState = { enabled: false, since: null, reason: null, operator: null };

export function emptyOperationalState(): OperationalState {
  return {
    maintenance: { ...EMPTY_MODE },
    lockdown: { ...EMPTY_MODE },
    history: [],
    updatedAt: null,
  };
}

const MAX_HISTORY = 200;

export class OperationalStateStore {
  private readonly filePath: string;
  private cache: OperationalState | null = null;

  /**
   * @param stateFile relative (to cwd) or absolute path to the JSON state file.
   * @param now clock injection for deterministic tests.
   */
  constructor(
    stateFile: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.filePath = isAbsolute(stateFile) ? stateFile : resolve(process.cwd(), stateFile);
  }

  /** Read current state, tolerating a missing/corrupt file (fail safe → empty). */
  async read(): Promise<OperationalState> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<OperationalState>;
      this.cache = {
        maintenance: { ...EMPTY_MODE, ...(parsed.maintenance ?? {}) },
        lockdown: { ...EMPTY_MODE, ...(parsed.lockdown ?? {}) },
        history: Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [],
        updatedAt: parsed.updatedAt ?? null,
      };
      return this.cache;
    } catch {
      // Missing or unreadable → the safe default is "no mode engaged".
      this.cache = emptyOperationalState();
      return this.cache;
    }
  }

  private async write(state: OperationalState): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp-${process.pid}`;
    const body = `${JSON.stringify(state, null, 2)}\n`;
    // Atomic replace; restrictive permissions (owner read/write only).
    await fs.writeFile(tmp, body, { mode: 0o600 });
    await fs.rename(tmp, this.filePath);
    this.cache = state;
  }

  private async setMode(
    mode: 'maintenance' | 'lockdown',
    enabled: boolean,
    operator: string,
    reason: string,
  ): Promise<OperationalState> {
    const state = await this.read();
    const at = this.now().toISOString();
    state[mode] = {
      enabled,
      since: enabled ? at : null,
      reason: enabled ? reason : null,
      operator: enabled ? operator : null,
    };
    state.history.push({ at, mode, action: enabled ? 'enable' : 'disable', operator, reason });
    state.history = state.history.slice(-MAX_HISTORY);
    state.updatedAt = at;
    await this.write(state);
    return state;
  }

  setMaintenance(enabled: boolean, operator: string, reason: string): Promise<OperationalState> {
    return this.setMode('maintenance', enabled, operator, reason);
  }

  setLockdown(enabled: boolean, operator: string, reason: string): Promise<OperationalState> {
    return this.setMode('lockdown', enabled, operator, reason);
  }

  async isMaintenance(): Promise<boolean> {
    return (await this.read()).maintenance.enabled;
  }

  async isLockdown(): Promise<boolean> {
    return (await this.read()).lockdown.enabled;
  }
}
