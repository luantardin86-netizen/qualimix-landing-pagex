export const LEAD_STATUSES = ['new', 'received', 'pending_sync', 'synced', 'sync_failed'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

/** Normalized lead ready to be persisted. */
export interface NewLead {
  nome: string
  sobrenome: string
  /** E.164, e.g. +5561999999999 */
  telefone: string
  empresa: string | null
  email: string | null
  servico: string
  mensagem: string
  origem: string
  pagina: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  consentimento: true
  consentimento_versao: string
  consentimento_em: Date
  ip_hash: string | null
  idempotency_key: string | null
  content_hash: string
}

export interface LeadRecord extends NewLead {
  id: string
  status: LeadStatus
  crm_external_id: string | null
  synced_at: Date | null
  received_at: Date
  created_at: Date
  updated_at: Date
}

export interface LeadRef {
  id: string
  status: LeadStatus
}

export interface CreateLeadResult extends LeadRef {
  /** false when an existing lead with the same idempotency key was returned. */
  created: boolean
}

export interface LeadRepository {
  ping(): Promise<void>
  findByIdempotencyKey(key: string): Promise<LeadRef | null>
  findRecentByContentHash(contentHash: string, withinSeconds: number): Promise<LeadRef | null>
  countRecentByPhone(telefone: string, withinSeconds: number): Promise<number>
  countRecentByIpHash(ipHash: string, withinSeconds: number): Promise<number>
  /** Persists the lead AND its outbox entry atomically. */
  createWithOutbox(lead: NewLead): Promise<CreateLeadResult>
}

export type AttemptOutcome = 'success' | 'retryable_error' | 'permanent_error'

export interface AttemptLog {
  attemptNumber: number
  outcome: AttemptOutcome
  httpStatus: number | null
  errorCode: string | null
  errorDetail: string | null
  crmExternalId: string | null
  durationMs: number
  startedAt: Date
}

export interface ClaimedJob {
  outboxId: string
  /** Attempt number of the delivery about to happen (1-based). */
  attempt: number
  lead: LeadRecord
}

export interface OutboxRepository {
  /** Atomically leases up to `limit` due jobs so no other worker can take them. */
  claimDue(limit: number, leaseSeconds: number): Promise<ClaimedJob[]>
  markSuccess(job: ClaimedJob, log: AttemptLog): Promise<void>
  markRetry(job: ClaimedJob, log: AttemptLog, nextAttemptAt: Date): Promise<void>
  markFailed(job: ClaimedJob, log: AttemptLog): Promise<void>
  /** Moves failed jobs back to pending so they are retried. Returns how many. */
  requeueFailed(leadIds?: string[]): Promise<number>
  countByStatus(): Promise<Record<LeadStatus, number>>
}
