/**
 * Action Queue Engine types (SPRINT 011).
 *
 * A SAFE BOUNDARY between an approved Human Review decision and future platform
 * execution. This sprint does NOT execute Facebook actions and runs NO Action
 * Worker. Execution is disabled by default; every Action Job is created BLOCKED
 * under current safety defaults (kill switch on, Facebook writes off).
 */

import type { ActionType, ActionStatus, TargetPlatform } from '../store/types';

export type { ActionType, ActionStatus, TargetPlatform };

/**
 * An IMMUTABLE Action intent built from an approved Review. It carries only the
 * approved content and a safe target — NO Facebook credentials, NO browser
 * metadata, NO cookies.
 */
export interface ActionIntent {
  workspaceId: string;
  reviewTaskId: string;
  aiDraftId: string;
  businessMatchId: string;
  actionType: ActionType;
  targetPlatform: TargetPlatform;
  targetUrl: string;
  approvedContent: string;
}

export type PolicyOutcome = 'ALLOW' | 'BLOCK' | 'REJECT';

export interface PolicyReason {
  code: string;
  detail: string;
}

/**
 * The Policy Guard's verdict. ALLOW → the job may be `queued`; BLOCK → the job
 * must be `blocked` (safety gate); REJECT → no job may be created at all.
 */
export interface ActionPolicyResult {
  outcome: PolicyOutcome;
  reasons: PolicyReason[];
}

/** The safety inputs the Policy Guard reads (all from server config, never a request). */
export interface ActionSafetyState {
  actionEngineEnabled: boolean;
  facebookWriteEnabled: boolean;
  killSwitchOn: boolean;
  allowedTypes: ActionType[];
  maxContentLength: number;
}
