import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStore } from '../store/memory';
import { loadApiEnv, type ApiEnv } from '../lib/env';
import { createLogger } from '../lib/logger';
import { ActionRepository } from '../action/repository';
import { ActionQueue } from '../action/queue';
import { ActionCoordinator } from '../action/coordinator';
import { ExecutionSessionRepository } from './session-repository';
import { ExecutionEvidenceRepository } from './evidence-repository';
import { ActionIdempotencyRepository } from './idempotency-repository';
import { ActionExecutor } from './executor';
import { ExecutionVerificationService } from './verification';
import { ExecutionRecoveryPolicy } from './recovery';
import { ExecutionCoordinator } from './coordinator';
import { ExecutionError } from './errors';
import type { FakeScenario } from './fake-adapter';

const logger = createLogger('error');

/** Env with every safety gate intentionally open — TESTS ONLY, fake adapter. */
const enabledEnv: ApiEnv = loadApiEnv({
  ACTION_ENGINE_ENABLED: 'true',
  FACEBOOK_WRITE_ACTION_ENABLED: 'true',
  FACEBOOK_COMMENT_ENABLED: 'true',
  GLOBAL_KILL_SWITCH: 'false',
  FACEBOOK_COMMENT_ADAPTER: 'fake',
});

function makeExecutionCoordinator(store: InMemoryStore, env: ApiEnv) {
  const actionRepo = new ActionRepository(store);
  const actionQueue = new ActionQueue(actionRepo);
  const sessions = new ExecutionSessionRepository(store);
  const evidence = new ExecutionEvidenceRepository(store);
  return new ExecutionCoordinator({
    sessions,
    evidence,
    idempotency: new ActionIdempotencyRepository(store),
    executor: new ActionExecutor({
      sessions,
      evidence,
      verification: new ExecutionVerificationService(),
      env,
      logger,
    }),
    recovery: new ExecutionRecoveryPolicy(),
    actionRepo,
    actionQueue,
    env,
    logger,
  });
}

async function seedQueuedJob(
  store: InMemoryStore,
  env: ApiEnv,
  content = 'สวัสดีค่ะ ยินดีให้บริการ',
) {
  const ws = randomUUID();
  const group = await store.createFacebookGroup({
    id: randomUUID(),
    workspaceId: ws,
    facebookGroupId: '1',
    canonicalUrl: 'https://www.facebook.com/groups/1',
    originalUrl: 'https://www.facebook.com/groups/1',
  });
  const business = await store.createBusiness(
    { id: randomUUID(), workspaceId: ws, name: 'ร้านช่างประปา', slug: randomUUID() },
    { id: randomUUID(), category: 'ประปา', description: null },
  );
  const signal = await store.createSignal({
    id: randomUUID(),
    workspaceId: ws,
    groupId: group.id,
    facebookPostId: null,
    postUrl: `https://www.facebook.com/groups/1/posts/${randomUUID().slice(0, 8)}`,
    authorName: 'A',
    authorProfile: null,
    message: 'หาช่างประปา',
    mediaUrls: [],
    createdTime: null,
    normalizedHash: randomUUID(),
  });
  const opp = await store.createOpportunity({
    id: randomUUID(),
    workspaceId: ws,
    signalId: signal.id,
    decision: 'ACCEPT',
    status: 'READY',
    classifierVersion: 'rules-v1',
  });
  const match = await store.createBusinessMatch({
    id: randomUUID(),
    workspaceId: ws,
    businessId: business.id,
    opportunityId: opp.id,
    decision: 'MATCH',
    reasons: [{ ruleType: 'keyword', ruleValue: 'ประปา', matched: true }],
    matcherVersion: 'rules-v1',
  });
  const draft = await store.createAiDraft({
    id: randomUUID(),
    workspaceId: ws,
    businessMatchId: match.id,
    opportunityId: opp.id,
    businessId: business.id,
    version: 1,
    status: 'draft',
    content,
    provider: 'mock',
    model: 'mock-draft-v1',
    promptVersion: 'rules-v1',
    inputSnapshot: null,
    policyResult: { decision: 'PASS', reasons: [] },
    createdBy: null,
  });
  const review = await store.createReviewTask({
    id: randomUUID(),
    workspaceId: ws,
    businessMatchId: match.id,
    draftId: draft.id,
    assignedTo: null,
  });
  await store.updateReviewTask(review.id, {
    status: 'APPROVED',
    decidedBy: 'u-1',
    editedContent: null,
  });

  const actionRepo = new ActionRepository(store);
  const actions = new ActionCoordinator({
    repo: actionRepo,
    queue: new ActionQueue(actionRepo),
    env,
    logger,
  });
  const { job } = await actions.createFromReview(ws, review.id, 'facebook_comment');
  return { ws, jobId: job.id, businessId: business.id, job };
}

describe('ExecutionCoordinator.prepareExecution (fake adapter)', () => {
  it('blocks with no session under the safe defaults (kill switch on)', async () => {
    const store = new InMemoryStore();
    const safeEnv = loadApiEnv({}); // defaults: engine off, writes off, kill switch on
    // Seed a job with the ENABLED env (so it is queued), then execute under safe env.
    const { ws, jobId } = await seedQueuedJob(store, enabledEnv);
    const coord = makeExecutionCoordinator(store, safeEnv);
    const r = await coord.prepareExecution(ws, jobId);
    expect(r.status).toBe('blocked');
    expect(r.session).toBeNull();
    expect(r.blockedReasons).toEqual(
      expect.arrayContaining(['ACTION_ENGINE_ENABLED is false', 'GLOBAL_KILL_SWITCH is on']),
    );
    expect(await coord.listSessions(ws, jobId)).toHaveLength(0);
  });

  it('runs a verified success end-to-end and records evidence', async () => {
    const store = new InMemoryStore();
    const { ws, jobId } = await seedQueuedJob(store, enabledEnv);
    const coord = makeExecutionCoordinator(store, enabledEnv);

    const r = await coord.prepareExecution(ws, jobId, { scenario: 'verified_success' });
    expect(r.status).toBe('verified');
    expect(r.session?.status).toBe('verified');
    expect(r.result?.facebookCommentId).toBeTruthy();
    expect(r.job.status).toBe('succeeded');
    expect(r.job.executionState).toBe('verified');
    expect(r.job.successIdempotencyKey).toBeTruthy();

    const detail = await coord.getSessionDetail(ws, r.session!.id);
    const types = detail.evidence.map((e) => e.evidenceType);
    expect(types).toEqual(
      expect.arrayContaining([
        'pre_submit_snapshot',
        'typed_content_snapshot',
        'submit_snapshot',
        'comment_identity',
        'verification_snapshot',
      ]),
    );
  });

  it.each<[FakeScenario, string]>([
    ['target_mismatch', 'failed'],
    ['typed_content_mismatch', 'failed'],
    ['submit_failed', 'failed'],
  ])('pre/at-submit failure %s → failed, no write (job failed)', async (scenario) => {
    const store = new InMemoryStore();
    const { ws, jobId } = await seedQueuedJob(store, enabledEnv);
    const coord = makeExecutionCoordinator(store, enabledEnv);
    const r = await coord.prepareExecution(ws, jobId, { scenario });
    expect(r.status).toBe('failed');
    expect(r.job.status).toBe('failed');
    expect(r.session?.status).toBe('failed');
  });

  it.each<FakeScenario>([
    'submit_ambiguous',
    'comment_not_found',
    'verification_content_mismatch',
    'comment_id_missing',
    'checkpoint_required',
    'session_expired',
    'account_restricted',
    'captcha',
  ])(
    'ambiguous/interrupt scenario %s never auto-retries and flags human recovery',
    async (scenario) => {
      const store = new InMemoryStore();
      const { ws, jobId } = await seedQueuedJob(store, enabledEnv);
      const coord = makeExecutionCoordinator(store, enabledEnv);
      const r = await coord.prepareExecution(ws, jobId, { scenario });
      expect(r.status).toBe('ambiguous');
      expect(r.job.executionState).toBe('ambiguous');
      expect(r.job.verificationRequired).toBe(true);
      // Ambiguous outcome keeps the job non-terminal (never silently succeeded).
      expect(r.job.status).not.toBe('succeeded');
      // Recovery classifies it as needing a human — never SAFE_RETRY.
      const rec = await coord.recover(ws, r.session!.id);
      expect(rec.classification.disposition).toBe('MANUAL_INVESTIGATION');
      expect(rec.classification.requiresHuman).toBe(true);
    },
  );

  it('refuses a second concurrent success (duplicate) for the same post', async () => {
    const store = new InMemoryStore();
    const { ws, jobId } = await seedQueuedJob(store, enabledEnv);
    const coord = makeExecutionCoordinator(store, enabledEnv);
    const first = await coord.prepareExecution(ws, jobId, { scenario: 'verified_success' });
    expect(first.status).toBe('verified');
    // A verified job is terminal; re-preparing the same job is not executable.
    await expect(coord.prepareExecution(ws, jobId)).rejects.toBeInstanceOf(ExecutionError);
  });

  it('a dry run exercises the pipeline without consuming the job', async () => {
    const store = new InMemoryStore();
    const { ws, jobId, job } = await seedQueuedJob(store, enabledEnv);
    const coord = makeExecutionCoordinator(store, enabledEnv);
    const r = await coord.prepareExecution(ws, jobId, {
      scenario: 'verified_success',
      dryRun: true,
    });
    expect(r.status).toBe('verified');
    // Job is untouched — still queued, no success key held.
    const after = await new ActionRepository(store).getJobById(jobId);
    expect(after?.status).toBe(job.status);
    expect(after?.successIdempotencyKey).toBeNull();
    // Idempotency reservation was released → a real run is still possible.
    const real = await coord.prepareExecution(ws, jobId, { scenario: 'verified_success' });
    expect(real.status).toBe('verified');
  });
});
