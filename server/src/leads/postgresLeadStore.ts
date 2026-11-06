/**
 * PostgreSQL implementation of the lead and outbox repositories.
 * Every statement uses positional parameters — no string interpolation of input.
 */
import { DatabaseUnavailableError, isDatabaseUnavailable, withTransaction, type DbPool } from '../db/pool'
import {
  LEAD_STATUSES,
  type AttemptLog,
  type ClaimedJob,
  type CreateLeadResult,
  type LeadRecord,
  type LeadRef,
  type LeadRepository,
  type LeadStatus,
  type NewLead,
  type OutboxRepository,
} from './types'

const LEAD_COLUMNS = [
  'nome', 'sobrenome', 'telefone', 'empresa', 'email', 'servico', 'mensagem', 'origem', 'pagina',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'consentimento', 'consentimento_versao', 'consentimento_em', 'ip_hash', 'idempotency_key', 'content_hash',
] as const satisfies readonly (keyof NewLead)[]

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      throw new DatabaseUnavailableError((error as { code?: string }).code)
    }
    throw error
  }
}

export class PostgresLeadStore implements LeadRepository, OutboxRepository {
  constructor(private readonly pool: DbPool) {}

  ping(): Promise<void> {
    return guard(async () => {
      await this.pool.query('SELECT 1 FROM leads LIMIT 1')
    })
  }

  findByIdempotencyKey(key: string): Promise<LeadRef | null> {
    return guard(async () => {
      const { rows } = await this.pool.query<LeadRef>('SELECT id, status FROM leads WHERE idempotency_key = $1', [key])
      return rows[0] ?? null
    })
  }

  findRecentByContentHash(contentHash: string, withinSeconds: number): Promise<LeadRef | null> {
    return guard(async () => {
      const { rows } = await this.pool.query<LeadRef>(
        `SELECT id, status FROM leads
          WHERE content_hash = $1 AND created_at > now() - make_interval(secs => $2)
          ORDER BY created_at DESC LIMIT 1`,
        [contentHash, withinSeconds],
      )
      return rows[0] ?? null
    })
  }

  countRecentByPhone(telefone: string, withinSeconds: number): Promise<number> {
    return guard(async () => {
      const { rows } = await this.pool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM leads WHERE telefone = $1 AND created_at > now() - make_interval(secs => $2)',
        [telefone, withinSeconds],
      )
      return rows[0]?.n ?? 0
    })
  }

  countRecentByIpHash(ipHash: string, withinSeconds: number): Promise<number> {
    return guard(async () => {
      const { rows } = await this.pool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM leads WHERE ip_hash = $1 AND created_at > now() - make_interval(secs => $2)',
        [ipHash, withinSeconds],
      )
      return rows[0]?.n ?? 0
    })
  }

  createWithOutbox(lead: NewLead): Promise<CreateLeadResult> {
    return guard(() =>
      withTransaction(this.pool, async (client) => {
        const values = LEAD_COLUMNS.map((c) => lead[c])
        const placeholders = LEAD_COLUMNS.map((_, i) => `$${i + 1}`).join(', ')
        // 1) Persist the lead as "received".
        const inserted = await client.query<LeadRef>(
          `INSERT INTO leads (${LEAD_COLUMNS.join(', ')}, status)
           VALUES (${placeholders}, 'received')
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id, status`,
          values,
        )
        const row = inserted.rows[0]
        if (!row) {
          // Same idempotency key already stored: return the original lead.
          const existing = await client.query<LeadRef>('SELECT id, status FROM leads WHERE idempotency_key = $1', [
            lead.idempotency_key,
          ])
          const found = existing.rows[0]
          if (!found) throw new Error('Idempotency conflict without existing row')
          return { ...found, created: false }
        }
        // 2) Enqueue for CRM delivery in the same transaction (transactional outbox).
        await client.query('INSERT INTO crm_outbox (lead_id) VALUES ($1)', [row.id])
        // 3) The lead is now waiting for the CRM.
        await client.query(`UPDATE leads SET status = 'pending_sync' WHERE id = $1`, [row.id])
        return { id: row.id, status: 'pending_sync' as const, created: true }
      }),
    )
  }

  claimDue(limit: number, leaseSeconds: number): Promise<ClaimedJob[]> {
    return guard(async () => {
      const claimed = await this.pool.query<{ id: string; lead_id: string; attempts: number }>(
        `UPDATE crm_outbox o
            SET status = 'processing',
                attempts = o.attempts + 1,
                locked_until = now() + make_interval(secs => $2)
          WHERE o.id IN (
            SELECT id FROM crm_outbox
             WHERE (status = 'pending' AND next_attempt_at <= now())
                OR (status = 'processing' AND locked_until < now())
             ORDER BY next_attempt_at
             LIMIT $1
             FOR UPDATE SKIP LOCKED)
        RETURNING o.id, o.lead_id, o.attempts`,
        [limit, leaseSeconds],
      )
      if (claimed.rows.length === 0) return []
      const leads = await this.pool.query<LeadRecord>('SELECT * FROM leads WHERE id = ANY($1::uuid[])', [
        claimed.rows.map((r) => r.lead_id),
      ])
      const byId = new Map(leads.rows.map((l) => [l.id, l]))
      return claimed.rows.flatMap((r) => {
        const lead = byId.get(r.lead_id)
        return lead ? [{ outboxId: r.id, attempt: r.attempts, lead }] : []
      })
    })
  }

  private async insertAttempt(client: { query: DbPool['query'] }, job: ClaimedJob, log: AttemptLog) {
    await client.query(
      `INSERT INTO crm_sync_attempts
         (lead_id, outbox_id, attempt_number, outcome, http_status, error_code, error_detail, crm_external_id, duration_ms, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        job.lead.id, job.outboxId, log.attemptNumber, log.outcome, log.httpStatus, log.errorCode,
        log.errorDetail, log.crmExternalId, log.durationMs, log.startedAt,
      ],
    )
  }

  markSuccess(job: ClaimedJob, log: AttemptLog): Promise<void> {
    return guard(() =>
      withTransaction(this.pool, async (client) => {
        await this.insertAttempt(client, job, log)
        await client.query(
          `UPDATE crm_outbox SET status = 'done', locked_until = NULL, last_error = NULL WHERE id = $1`,
          [job.outboxId],
        )
        await client.query(
          `UPDATE leads SET status = 'synced', synced_at = now(), crm_external_id = $2 WHERE id = $1`,
          [job.lead.id, log.crmExternalId],
        )
      }),
    )
  }

  markRetry(job: ClaimedJob, log: AttemptLog, nextAttemptAt: Date): Promise<void> {
    return guard(() =>
      withTransaction(this.pool, async (client) => {
        await this.insertAttempt(client, job, log)
        await client.query(
          `UPDATE crm_outbox SET status = 'pending', locked_until = NULL, next_attempt_at = $2, last_error = $3 WHERE id = $1`,
          [job.outboxId, nextAttemptAt, log.errorCode],
        )
        await client.query(`UPDATE leads SET status = 'pending_sync' WHERE id = $1`, [job.lead.id])
      }),
    )
  }

  markFailed(job: ClaimedJob, log: AttemptLog): Promise<void> {
    return guard(() =>
      withTransaction(this.pool, async (client) => {
        await this.insertAttempt(client, job, log)
        await client.query(
          `UPDATE crm_outbox SET status = 'failed', locked_until = NULL, last_error = $2 WHERE id = $1`,
          [job.outboxId, log.errorCode],
        )
        await client.query(`UPDATE leads SET status = 'sync_failed' WHERE id = $1`, [job.lead.id])
      }),
    )
  }

  requeueFailed(leadIds?: string[]): Promise<number> {
    return guard(() =>
      withTransaction(this.pool, async (client) => {
        const filter = leadIds && leadIds.length > 0
        const { rows } = await client.query<{ lead_id: string }>(
          `UPDATE crm_outbox SET status = 'pending', attempts = 0, next_attempt_at = now(), locked_until = NULL
            WHERE status = 'failed' ${filter ? 'AND lead_id = ANY($1::uuid[])' : ''}
          RETURNING lead_id`,
          filter ? [leadIds] : [],
        )
        if (rows.length > 0) {
          await client.query(`UPDATE leads SET status = 'pending_sync' WHERE id = ANY($1::uuid[])`, [
            rows.map((r) => r.lead_id),
          ])
        }
        return rows.length
      }),
    )
  }

  countByStatus(): Promise<Record<LeadStatus, number>> {
    return guard(async () => {
      const { rows } = await this.pool.query<{ status: LeadStatus; n: number }>(
        'SELECT status, count(*)::int AS n FROM leads GROUP BY status',
      )
      const out = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>
      for (const r of rows) out[r.status] = r.n
      return out
    })
  }
}
