/**
 * Outbox consumer: delivers pending leads to the CRM with persistent retries.
 *
 * Guarantees:
 * - A lead is only marked `synced` after the CRM answers 2xx.
 * - While CRM_API_URL is not configured nothing is sent and leads stay `pending_sync`.
 * - Rows are leased (FOR UPDATE SKIP LOCKED + locked_until) so concurrent
 *   workers never deliver the same lead at the same time.
 * - Retryable failures use exponential backoff; after `maxAttempts` (or on a
 *   permanent 4xx) the lead becomes `sync_failed` and can be requeued.
 */
import type { Logger } from '../logger'
import { describeError } from '../logger'
import type { AttemptLog, ClaimedJob, OutboxRepository } from '../leads/types'
import type { CrmLeadClient } from './CrmLeadClient'

export interface CrmSyncOptions {
  batchSize: number
  maxAttempts: number
  leaseSeconds?: number
  baseDelayMs?: number
  maxDelayMs?: number
  random?: () => number
  now?: () => Date
}

export interface SyncRunSummary {
  configured: boolean
  processed: number
  synced: number
  retrying: number
  failed: number
}

export function backoffDelayMs(attempt: number, baseDelayMs = 30_000, maxDelayMs = 6 * 3600_000, random = Math.random) {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1))
  // +/- 20% jitter to avoid thundering herds.
  return Math.round(exp * (0.8 + random() * 0.4))
}

export function createCrmSyncService(deps: {
  outbox: OutboxRepository
  client: CrmLeadClient
  logger: Logger
  options: CrmSyncOptions
}) {
  const { outbox, client, logger, options } = deps
  const now = options.now ?? (() => new Date())
  let running = false

  async function deliver(job: ClaimedJob, summary: SyncRunSummary) {
    const startedAt = now()
    const result = await client.sendLead(job.lead)
    const log: AttemptLog = {
      attemptNumber: job.attempt,
      outcome: result.outcome,
      httpStatus: result.httpStatus,
      errorCode: result.outcome === 'success' ? null : result.errorCode,
      errorDetail: result.outcome === 'success' ? null : result.errorDetail,
      crmExternalId: result.outcome === 'success' ? result.externalId : null,
      durationMs: result.durationMs,
      startedAt,
    }

    if (result.outcome === 'success') {
      await outbox.markSuccess(job, log)
      summary.synced++
      logger.info('crm.sync.success', { leadId: job.lead.id, attempt: job.attempt, httpStatus: result.httpStatus })
      return
    }
    if (result.outcome === 'retryable_error' && job.attempt < options.maxAttempts) {
      const delay = backoffDelayMs(job.attempt, options.baseDelayMs, options.maxDelayMs, options.random)
      await outbox.markRetry(job, log, new Date(now().getTime() + delay))
      summary.retrying++
      logger.warn('crm.sync.retry_scheduled', {
        leadId: job.lead.id, attempt: job.attempt, errorCode: result.errorCode, httpStatus: result.httpStatus, delayMs: delay,
      })
      return
    }
    await outbox.markFailed(job, log)
    summary.failed++
    logger.error('crm.sync.failed', {
      leadId: job.lead.id, attempt: job.attempt, errorCode: result.errorCode, httpStatus: result.httpStatus, outcome: result.outcome,
    })
  }

  return {
    /** Processes one batch of due outbox entries. Safe to call concurrently. */
    async runOnce(): Promise<SyncRunSummary> {
      const summary: SyncRunSummary = { configured: client.isConfigured(), processed: 0, synced: 0, retrying: 0, failed: 0 }
      if (!summary.configured) {
        logger.debug('crm.sync.skipped', { reason: 'CRM_API_URL not configured; leads remain pending_sync' })
        return summary
      }
      if (running) return summary
      running = true
      try {
        const jobs = await outbox.claimDue(options.batchSize, options.leaseSeconds ?? 120)
        for (const job of jobs) {
          summary.processed++
          try {
            await deliver(job, summary)
          } catch (error) {
            // Could not record the outcome (e.g. DB hiccup). The lease expires and the job is retried
            // with the same Idempotency-Key, so the CRM can de-duplicate.
            logger.error('crm.sync.record_error', { leadId: job.lead.id, ...describeError(error) })
          }
        }
        return summary
      } finally {
        running = false
      }
    },

    /** Drains all due entries (used by the CLI). */
    async drain(maxBatches = 50): Promise<SyncRunSummary> {
      const total: SyncRunSummary = { configured: client.isConfigured(), processed: 0, synced: 0, retrying: 0, failed: 0 }
      for (let i = 0; i < maxBatches; i++) {
        const s = await this.runOnce()
        total.processed += s.processed
        total.synced += s.synced
        total.retrying += s.retrying
        total.failed += s.failed
        if (!s.configured || s.processed < options.batchSize) break
      }
      return total
    },
  }
}

export type CrmSyncService = ReturnType<typeof createCrmSyncService>
