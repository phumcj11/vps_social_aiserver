import type { ApiEnv } from '../lib/env';
import type { Logger } from '../lib/logger';
import type { Store } from '../store/types';
import type { AuditService } from '../lib/audit';
import { OperationalStateStore, type OperationalState } from './state';
import { effectiveSafety, isOperator, type EffectiveSafety } from './guard';
import { OperationsError, OperationsErrorCode } from './errors';
import { listBackups, newestBackupAgeHours, type BackupSummary } from './backups';
import {
  collectSystemMetrics,
  evaluateSystem,
  evaluateBackupAge,
  worstOf,
  type CheckResult,
  type Level,
  type MonitorThresholds,
} from './monitor';

export interface OperationsServiceDeps {
  store: Store;
  env: ApiEnv;
  audit: AuditService;
  stateStore: OperationalStateStore;
  logger: Logger;
  dbHealth?: () => Promise<boolean>;
}

export interface HealthResult {
  status: 'ok' | 'degraded' | 'down';
  checks: CheckResult[];
}

/**
 * OperationsService (SPRINT 013).
 *
 * Hosts the operator-facing operational surface AND the public-safe health
 * checks. It never returns secrets, absolute paths, or customer content — only
 * booleans, counts, and coarse status. Maintenance and Lockdown transitions are
 * persisted (survive restart) and audited.
 */
export class OperationsService {
  constructor(private readonly deps: OperationsServiceDeps) {}

  private thresholds(): MonitorThresholds {
    const e = this.deps.env;
    return {
      diskWarningPercent: e.MONITOR_DISK_WARNING_PERCENT,
      diskCriticalPercent: e.MONITOR_DISK_CRITICAL_PERCENT,
      ramWarningMb: e.MONITOR_RAM_WARNING_MB,
      ramCriticalMb: e.MONITOR_RAM_CRITICAL_MB,
      swapWarningPercent: e.MONITOR_SWAP_WARNING_PERCENT,
      swapCriticalPercent: e.MONITOR_SWAP_CRITICAL_PERCENT,
      loadWarning: e.MONITOR_LOAD_WARNING,
      loadCritical: e.MONITOR_LOAD_CRITICAL,
      backupStaleHours: e.BACKUP_STALE_HOURS,
    };
  }

  isOperatorEmail(email: string | null | undefined): boolean {
    return isOperator(this.deps.env, email);
  }

  async effective(): Promise<EffectiveSafety> {
    const state = await this.deps.stateStore.read();
    return effectiveSafety(this.deps.env, state);
  }

  // ── Health checks (public-safe) ────────────────────────────────────────────

  liveness(): { status: 'ok'; service: string } {
    return { status: 'ok', service: 'kmkt-api' };
  }

  async readiness(): Promise<{ ready: boolean; dependencies: Record<string, string> }> {
    const dbOk = this.deps.dbHealth ? await this.deps.dbHealth() : true;
    const state = await this.deps.stateStore.read();
    // Not "ready" for normal user work while in maintenance or lockdown.
    const ready = dbOk && !state.maintenance.enabled && !state.lockdown.enabled;
    return {
      ready,
      dependencies: {
        database: dbOk ? 'ok' : 'down',
        maintenance: state.maintenance.enabled ? 'on' : 'off',
        lockdown: state.lockdown.enabled ? 'on' : 'off',
      },
    };
  }

  async dependencyHealth(): Promise<HealthResult> {
    const dbOk = this.deps.dbHealth ? await this.deps.dbHealth() : true;
    const checks: CheckResult[] = [
      {
        name: 'database',
        level: dbOk ? 'OK' : 'CRITICAL',
        detail: dbOk ? 'reachable' : 'unreachable',
      },
    ];
    return this.toHealth(checks);
  }

  async safetyHealth(): Promise<{
    status: 'ok';
    executionIntentionallyDisabled: boolean;
    flags: EffectiveSafety;
  }> {
    const flags = await this.effective();
    // Execution is intentionally disabled when writes/engine/comment are off,
    // the kill switch is on, and the adapter is the fake.
    const disabled =
      !flags.actionEngineEnabled &&
      !flags.facebookWriteEnabled &&
      !flags.facebookCommentEnabled &&
      flags.killSwitchOn &&
      flags.adapter === 'fake';
    return { status: 'ok', executionIntentionallyDisabled: disabled, flags };
  }

  async storageHealth(): Promise<HealthResult> {
    const m = await collectSystemMetrics(process.cwd());
    const t = this.thresholds();
    const checks = evaluateSystem(m, t).filter((c) => c.name === 'disk');
    const backupAge = await newestBackupAgeHours(this.deps.env.BACKUP_ROOT);
    checks.push(evaluateBackupAge(backupAge, t.backupStaleHours));
    return this.toHealth(checks);
  }

  async queueHealth(): Promise<HealthResult> {
    const counts = await this.deps.store.getOperationalCounts({
      now: new Date(),
      actionProcessingStaleMs: this.deps.env.FACEBOOK_COMMENT_EXECUTION_TIMEOUT_MS,
      collectorRunningStaleMs: this.deps.env.COLLECTOR_TIMEOUT_MS,
    });
    const checks: CheckResult[] = [
      {
        name: 'stuck_action_jobs',
        level: counts.stuckActionJobs > 0 ? 'WARNING' : 'OK',
        value: counts.stuckActionJobs,
        detail: `${counts.stuckActionJobs} stuck`,
      },
      {
        name: 'stuck_collector_runs',
        level: counts.stuckCollectorRuns > 0 ? 'WARNING' : 'OK',
        value: counts.stuckCollectorRuns,
        detail: `${counts.stuckCollectorRuns} stuck`,
      },
      {
        name: 'ambiguous_executions',
        level: counts.executionSessions.ambiguous > 0 ? 'WARNING' : 'OK',
        value: counts.executionSessions.ambiguous,
        detail: `${counts.executionSessions.ambiguous} ambiguous (need recovery)`,
      },
    ];
    return this.toHealth(checks);
  }

  private toHealth(checks: CheckResult[]): HealthResult {
    const overall = worstOf(checks.map((c) => c.level));
    const status = overall === 'OK' ? 'ok' : overall === 'WARNING' ? 'degraded' : 'down';
    return { status, checks };
  }

  // ── Monitoring (operator) ──────────────────────────────────────────────────

  async monitoring(): Promise<{ overall: Level; checks: CheckResult[] }> {
    const t = this.thresholds();
    const m = await collectSystemMetrics(process.cwd());
    const checks = evaluateSystem(m, t);
    const backupAge = await newestBackupAgeHours(this.deps.env.BACKUP_ROOT);
    checks.push(evaluateBackupAge(backupAge, t.backupStaleHours));
    const q = await this.queueHealth();
    checks.push(...q.checks);
    return { overall: worstOf(checks.map((c) => c.level)), checks };
  }

  async backups(): Promise<BackupSummary[]> {
    return listBackups(this.deps.env.BACKUP_ROOT);
  }

  async incidents(): Promise<OperationalState['history']> {
    const state = await this.deps.stateStore.read();
    return state.history
      .filter((h) => h.mode === 'lockdown')
      .slice(-50)
      .reverse();
  }

  // ── Aggregate status ───────────────────────────────────────────────────────

  async status(): Promise<Record<string, unknown>> {
    const state = await this.deps.stateStore.read();
    const flags = effectiveSafety(this.deps.env, state);
    const m = await collectSystemMetrics(process.cwd());
    const backups = await listBackups(this.deps.env.BACKUP_ROOT);
    const counts = await this.deps.store.getOperationalCounts({
      now: new Date(),
      actionProcessingStaleMs: this.deps.env.FACEBOOK_COMMENT_EXECUTION_TIMEOUT_MS,
      collectorRunningStaleMs: this.deps.env.COLLECTOR_TIMEOUT_MS,
    });
    const lastLockdown = state.history.filter((h) => h.mode === 'lockdown').slice(-1)[0] ?? null;

    return {
      mode: flags.lockdown ? 'INCIDENT_LOCKDOWN' : flags.maintenance ? 'MAINTENANCE' : 'NORMAL',
      readinessLevel: this.readinessLevel(flags),
      maintenance: state.maintenance,
      lockdown: state.lockdown,
      safety: flags,
      system: {
        diskUsedPercent: m.diskUsedPercent,
        diskFreeGb: m.diskFreeGb,
        ramAvailableMb: m.ramAvailableMb,
        swapUsedPercent: m.swapUsedPercent,
        loadAvg1: m.loadAvg1,
      },
      queues: {
        actionJobs: counts.actionJobs,
        executionSessions: counts.executionSessions,
        stuckActionJobs: counts.stuckActionJobs,
        stuckCollectorRuns: counts.stuckCollectorRuns,
        ambiguousExecutions: counts.executionSessions.ambiguous,
      },
      backups: {
        count: backups.length,
        latest: backups[0]
          ? {
              kind: backups[0].kind,
              createdAt: backups[0].createdAt,
              ageHours: backups[0].ageHours,
            }
          : null,
      },
      lastIncident: lastLockdown,
    };
  }

  /** Coarse readiness posture shown in the UI (NOT the full pilot checklist). */
  private readinessLevel(flags: EffectiveSafety): string {
    if (flags.lockdown) return 'INCIDENT_LOCKDOWN';
    if (flags.maintenance) return 'MAINTENANCE';
    if (
      !flags.actionEngineEnabled &&
      !flags.facebookWriteEnabled &&
      flags.killSwitchOn &&
      flags.adapter === 'fake'
    ) {
      return 'LEVEL_1_INTERNAL_FAKE_EXECUTION';
    }
    return 'LEVEL_2_CONTROLLED_WRITE_TEST';
  }

  // ── Mode transitions (operator, audited, persisted) ────────────────────────

  private ensureReason(reason: string): void {
    if (!reason || reason.trim().length < 3) {
      throw new OperationsError(OperationsErrorCode.REASON_REQUIRED, 'A reason is required');
    }
  }

  async setMaintenance(
    enabled: boolean,
    operator: string,
    reason: string,
  ): Promise<OperationalState> {
    this.ensureReason(reason);
    const state = await this.deps.stateStore.setMaintenance(enabled, operator, reason);
    await this.deps.audit.record(enabled ? 'maintenance_enabled' : 'maintenance_disabled', {
      userId: null,
      payload: { operator, reason },
    });
    this.deps.logger.warn('operations.maintenance', { enabled, operator });
    return state;
  }

  async setLockdown(enabled: boolean, operator: string, reason: string): Promise<OperationalState> {
    this.ensureReason(reason);
    const state = await this.deps.stateStore.setLockdown(enabled, operator, reason);
    await this.deps.audit.record(
      enabled ? 'incident_lockdown_enabled' : 'incident_lockdown_disabled',
      {
        userId: null,
        payload: { operator, reason },
      },
    );
    this.deps.logger.warn('operations.lockdown', { enabled, operator });
    return state;
  }
}
