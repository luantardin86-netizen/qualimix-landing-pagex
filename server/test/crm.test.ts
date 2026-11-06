/**
 * CRM connector + outbox tests. The "CRM" here is a local HTTP test server
 * whose responses are controlled by each test — it exercises the real client
 * over a real socket. No production CRM is simulated by the application.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createContainer } from '../src/container'
import { CrmLeadClient, CrmNotConfiguredError } from '../src/crm/CrmLeadClient'
import { backoffDelayMs, createCrmSyncService } from '../src/crm/crmSyncService'
import { PostgresLeadStore } from '../src/leads/postgresLeadStore'
import { silentLogger } from '../src/logger'
import { createTestPool } from './pglitePool'
import { testConfig, validPayload } from './helpers'

type Handler = (req: IncomingMessage, body: string) => { status: number; body?: string; delayMs?: number }
let handler: Handler = () => ({ status: 201, body: '{"id":"crm-1"}' })
const received: { headers: IncomingMessage['headers']; body: Record<string, unknown> }[] = []
let server: Server
let crmUrl = ''
let pool: Awaited<ReturnType<typeof createTestPool>>

beforeAll(async () => {
  server = createServer((req, res) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => {
      received.push({ headers: req.headers, body: JSON.parse(data || '{}') })
      const r = handler(req, data)
      setTimeout(() => {
        res.writeHead(r.status, { 'Content-Type': 'application/json' })
        res.end(r.body ?? '')
      }, r.delayMs ?? 0)
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  crmUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/leads`
  pool = await createTestPool()
})
afterAll(async () => {
  server.close()
  await pool.end?.()
})
beforeEach(async () => {
  received.length = 0
  handler = () => ({ status: 201, body: '{"id":"crm-1"}' })
  await pool.query('TRUNCATE leads CASCADE')
})

async function createLead(overrides: Record<string, string> = {}) {
  const { app } = createContainer({ config: testConfig(overrides), pool, logger: silentLogger })
  const res = await app.request('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validPayload()),
  })
  return (await res.json()).id as string
}

function sync(opts: { maxAttempts?: number; url?: string; timeoutMs?: number } = {}) {
  const store = new PostgresLeadStore(pool)
  const client = new CrmLeadClient({ apiUrl: opts.url ?? crmUrl, apiToken: 'tok-123', timeoutMs: opts.timeoutMs ?? 2000 })
  return createCrmSyncService({
    outbox: store,
    client,
    logger: silentLogger,
    options: { batchSize: 10, maxAttempts: opts.maxAttempts ?? 3, baseDelayMs: 0, random: () => 0.5 },
  })
}

async function leadState(id: string) {
  const lead = (await pool.query<Record<string, unknown>>('SELECT status, crm_external_id, synced_at FROM leads WHERE id=$1', [id])).rows[0]!
  const outbox = (await pool.query<Record<string, unknown>>('SELECT status, attempts, last_error FROM crm_outbox WHERE lead_id=$1', [id])).rows[0]!
  const attempts = (
    await pool.query<Record<string, unknown>>(
      'SELECT attempt_number, outcome, http_status, error_code FROM crm_sync_attempts WHERE lead_id=$1 ORDER BY id',
      [id],
    )
  ).rows
  return { lead, outbox, attempts }
}

describe('CrmLeadClient', () => {
  it('throws when not configured instead of pretending to send', async () => {
    const client = new CrmLeadClient({ apiUrl: '', apiToken: '', timeoutMs: 1000 })
    expect(client.isConfigured()).toBe(false)
    await expect(client.sendLead({} as never)).rejects.toBeInstanceOf(CrmNotConfiguredError)
  })

  it('classifies HTTP statuses', async () => {
    const id = await createLead()
    const lead = (await pool.query('SELECT * FROM leads WHERE id=$1', [id])).rows[0] as never
    const client = new CrmLeadClient({ apiUrl: crmUrl, apiToken: '', timeoutMs: 2000 })
    const cases: [number, string, string | undefined][] = [
      [200, 'success', undefined],
      [503, 'retryable_error', 'crm_server_error'],
      [429, 'retryable_error', 'crm_rate_limited'],
      [401, 'permanent_error', 'crm_auth_error'],
      [422, 'permanent_error', 'crm_rejected_payload'],
    ]
    for (const [status, outcome, code] of cases) {
      handler = () => ({ status, body: '{"error":"x for joao@email.com"}' })
      const r = await client.sendLead(lead)
      expect(r.outcome, String(status)).toBe(outcome)
      if (r.outcome !== 'success') {
        expect(r.errorCode).toBe(code)
        expect(r.errorDetail).not.toContain('joao@email.com')
      }
    }
  })

  it('reports timeouts and network errors as retryable', async () => {
    const id = await createLead()
    const lead = (await pool.query('SELECT * FROM leads WHERE id=$1', [id])).rows[0] as never
    handler = () => ({ status: 200, delayMs: 500 })
    const slow = await new CrmLeadClient({ apiUrl: crmUrl, apiToken: '', timeoutMs: 100 }).sendLead(lead)
    expect(slow).toMatchObject({ outcome: 'retryable_error', errorCode: 'crm_timeout' })
    const down = await new CrmLeadClient({ apiUrl: 'http://127.0.0.1:1/leads', apiToken: '', timeoutMs: 1000 }).sendLead(lead)
    expect(down).toMatchObject({ outcome: 'retryable_error', errorCode: 'crm_network_error', httpStatus: null })
  })
})

describe('CRM sync (outbox)', () => {
  it('leaves leads pending_sync when CRM_API_URL is not configured', async () => {
    const id = await createLead()
    const summary = await sync({ url: '' }).runOnce()
    expect(summary).toMatchObject({ configured: false, processed: 0 })
    const s = await leadState(id)
    expect(s.lead.status).toBe('pending_sync')
    expect(s.outbox).toMatchObject({ status: 'pending', attempts: 0 })
    expect(received).toHaveLength(0)
  })

  it('marks synced only after a 2xx, sends auth + idempotency headers and stores the CRM id', async () => {
    const id = await createLead()
    const summary = await sync().runOnce()
    expect(summary).toMatchObject({ processed: 1, synced: 1 })
    expect(received[0]!.headers.authorization).toBe('Bearer tok-123')
    expect(received[0]!.headers['idempotency-key']).toBe(id)
    expect(received[0]!.body).toMatchObject({ external_id: id, telefone: '+5561991124510', utm_source: 'google' })
    const s = await leadState(id)
    expect(s.lead).toMatchObject({ status: 'synced', crm_external_id: 'crm-1' })
    expect(s.lead.synced_at).toBeInstanceOf(Date)
    expect(s.outbox.status).toBe('done')
    expect(s.attempts).toEqual([{ attempt_number: 1, outcome: 'success', http_status: 201, error_code: null }])
    // A synced lead is never sent again.
    await sync().runOnce()
    expect(received).toHaveLength(1)
  })

  it('retries communication failures, then recovers', async () => {
    const id = await createLead()
    handler = () => ({ status: 503 })
    expect(await sync().runOnce()).toMatchObject({ retrying: 1 })
    let s = await leadState(id)
    expect(s.lead.status).toBe('pending_sync')
    expect(s.outbox).toMatchObject({ status: 'pending', attempts: 1, last_error: 'crm_server_error' })

    handler = () => ({ status: 200, body: '{"data":{"id":42}}' })
    expect(await sync().runOnce()).toMatchObject({ synced: 1 })
    s = await leadState(id)
    expect(s.lead).toMatchObject({ status: 'synced', crm_external_id: '42' })
    expect(s.attempts.map((a) => a.outcome)).toEqual(['retryable_error', 'success'])
    // Same idempotency key on every attempt -> CRM can de-duplicate.
    expect(new Set(received.map((r) => r.headers['idempotency-key']))).toEqual(new Set([id]))
  })

  it('marks sync_failed after max attempts or a permanent error, and requeue reprocesses them', async () => {
    const a = await createLead()
    handler = () => ({ status: 500 })
    const svc = sync({ maxAttempts: 2 })
    await svc.runOnce()
    await svc.runOnce()
    expect((await leadState(a)).lead.status).toBe('sync_failed')
    expect((await leadState(a)).attempts).toHaveLength(2)

    const b = await createLead()
    handler = () => ({ status: 400 })
    await svc.runOnce()
    const sb = await leadState(b)
    expect(sb.lead.status).toBe('sync_failed')
    expect(sb.outbox).toMatchObject({ status: 'failed', attempts: 1, last_error: 'crm_rejected_payload' })

    // Failed leads are not retried automatically...
    received.length = 0
    await svc.runOnce()
    expect(received).toHaveLength(0)

    // ...until requeued (e.g. after fixing credentials).
    const store = new PostgresLeadStore(pool)
    expect(await store.requeueFailed()).toBe(2)
    expect((await leadState(a)).lead.status).toBe('pending_sync')
    handler = () => ({ status: 201 })
    expect(await svc.runOnce()).toMatchObject({ processed: 2, synced: 2 })
    expect(await store.countByStatus()).toMatchObject({ synced: 2, pending_sync: 0, sync_failed: 0 })
  })

  it('does not hand the same lead to two concurrent workers', async () => {
    await createLead()
    const store = new PostgresLeadStore(pool)
    const [x, y] = await Promise.all([store.claimDue(10, 120), store.claimDue(10, 120)])
    expect(x.length + y.length).toBe(1)
  })

  it('admin endpoint triggers a sync run', async () => {
    const id = await createLead()
    const { app } = createContainer({ config: testConfig({ CRM_API_URL: crmUrl }), pool, logger: silentLogger })
    const res = await app.request('/api/admin/crm-sync', { method: 'POST', headers: { Authorization: 'Bearer admin-test-token' } })
    expect(await res.json()).toMatchObject({ ok: true, summary: { synced: 1 } })
    expect((await leadState(id)).lead.status).toBe('synced')
  })
})

describe('backoff', () => {
  it('grows exponentially and is capped', () => {
    const r = () => 0.5
    expect(backoffDelayMs(1, 1000, 60_000, r)).toBe(1000)
    expect(backoffDelayMs(3, 1000, 60_000, r)).toBe(4000)
    expect(backoffDelayMs(20, 1000, 60_000, r)).toBe(60_000)
  })
})

describe('config', () => {
  it('requires HTTPS for the CRM in production', () => {
    expect(() => testConfig({ NODE_ENV: 'production', CRM_API_URL: 'http://crm.example/leads' })).toThrow(/HTTPS/)
    expect(testConfig({ CRM_API_URL: 'https://crm.example/leads' }).crm.apiUrl).toBe('https://crm.example/leads')
  })
})
