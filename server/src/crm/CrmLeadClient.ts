/**
 * HTTP client responsible for ALL communication with the external CRM.
 *
 * - Endpoint and token come exclusively from server-side env vars
 *   (CRM_API_URL / CRM_API_TOKEN). Never expose them to the browser.
 * - Every request carries `Idempotency-Key: <lead id>` and `external_id` so the
 *   CRM can de-duplicate if a retry happens after a lost response.
 * - It does not retry by itself: it classifies the outcome and the sync
 *   service decides when to retry (persistent backoff via the outbox).
 */
import { redactPII } from '../logger'
import type { LeadRecord } from '../leads/types'
import { toCrmPayload, type CrmLeadPayload } from './crmPayload'

export interface CrmLeadClientOptions {
  apiUrl: string
  apiToken: string
  timeoutMs: number
  fetchImpl?: typeof fetch
  mapPayload?: (lead: LeadRecord) => CrmLeadPayload | Record<string, unknown>
}

export type CrmSendResult =
  | { outcome: 'success'; httpStatus: number; externalId: string | null; durationMs: number }
  | {
      outcome: 'retryable_error' | 'permanent_error'
      httpStatus: number | null
      errorCode: string
      errorDetail: string | null
      durationMs: number
    }

/** HTTP statuses that indicate a temporary condition worth retrying. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

export class CrmNotConfiguredError extends Error {
  constructor() {
    super('CRM integration is not configured (CRM_API_URL is empty)')
    this.name = 'CrmNotConfiguredError'
  }
}

export class CrmLeadClient {
  private readonly fetchImpl: typeof fetch
  private readonly mapPayload: NonNullable<CrmLeadClientOptions['mapPayload']>

  constructor(private readonly options: CrmLeadClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.mapPayload = options.mapPayload ?? toCrmPayload
  }

  isConfigured(): boolean {
    return this.options.apiUrl.trim() !== ''
  }

  async sendLead(lead: LeadRecord): Promise<CrmSendResult> {
    if (!this.isConfigured()) throw new CrmNotConfiguredError()
    const started = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Idempotency-Key': lead.id,
      'User-Agent': 'qualimix-leads-api/1.0',
    }
    if (this.options.apiToken) headers.Authorization = `Bearer ${this.options.apiToken}`

    let response: Response
    try {
      response = await this.fetchImpl(this.options.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(this.mapPayload(lead)),
        signal: controller.signal,
        redirect: 'error',
      })
    } catch (error) {
      const aborted = controller.signal.aborted
      return {
        outcome: 'retryable_error',
        httpStatus: null,
        errorCode: aborted ? 'crm_timeout' : 'crm_network_error',
        errorDetail: aborted ? `No response within ${this.options.timeoutMs}ms` : safeDetail(String((error as Error)?.message ?? error)),
        durationMs: Date.now() - started,
      }
    } finally {
      clearTimeout(timer)
    }

    const durationMs = Date.now() - started
    const text = await response.text().catch(() => '')

    if (response.ok) {
      return { outcome: 'success', httpStatus: response.status, externalId: extractExternalId(text), durationMs }
    }
    const retryable = RETRYABLE_STATUS.has(response.status)
    return {
      outcome: retryable ? 'retryable_error' : 'permanent_error',
      httpStatus: response.status,
      errorCode: errorCodeFor(response.status),
      errorDetail: safeDetail(text),
      durationMs,
    }
  }
}

function errorCodeFor(status: number): string {
  if (status === 401 || status === 403) return 'crm_auth_error'
  if (status === 404) return 'crm_endpoint_not_found'
  if (status === 409) return 'crm_conflict'
  if (status === 400 || status === 422) return 'crm_rejected_payload'
  if (status === 429) return 'crm_rate_limited'
  if (status >= 500) return 'crm_server_error'
  return `crm_http_${status}`
}

/** Response bodies may echo personal data: redact and truncate before storing. */
function safeDetail(text: string): string | null {
  const trimmed = text.trim()
  return trimmed ? redactPII(trimmed).slice(0, 300) : null
}

/** Accepts common shapes: {id}, {lead_id}, {data: {id}}. Returns null if absent. */
function extractExternalId(text: string): string | null {
  if (!text) return null
  try {
    const body = JSON.parse(text) as Record<string, unknown>
    const candidates = [body?.id, body?.lead_id, (body?.data as Record<string, unknown> | undefined)?.id]
    for (const c of candidates) {
      if (typeof c === 'string' && c.length <= 200) return c
      if (typeof c === 'number') return String(c)
    }
  } catch {
    /* non-JSON success body is acceptable */
  }
  return null
}
