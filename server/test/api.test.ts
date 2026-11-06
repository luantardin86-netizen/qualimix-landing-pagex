/**
 * Integration tests: HTTP API -> validation -> PostgreSQL (PGlite) -> outbox.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createContainer } from '../src/container'
import type { DbPool } from '../src/db/pool'
import { silentLogger } from '../src/logger'
import { createTestPool } from './pglitePool'
import { testConfig, validPayload } from './helpers'

let pool: Awaited<ReturnType<typeof createTestPool>>
let ip = 0

function makeApp(overrides: Record<string, string> = {}, p: DbPool = pool) {
  const { app } = createContainer({
    config: testConfig(overrides),
    pool: p,
    logger: silentLogger,
    getClientIp: (c) => c.req.header('X-Test-Ip') ?? null,
  })
  return app
}

function post(app: ReturnType<typeof makeApp>, body: unknown, headers: Record<string, string> = {}) {
  return app.request('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test-Ip': `10.0.0.${++ip}`, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeAll(async () => {
  pool = await createTestPool()
})
afterAll(async () => {
  await pool.end?.()
})
beforeEach(async () => {
  await pool.query('TRUNCATE leads CASCADE')
})

describe('POST /api/leads', () => {
  it('stores a valid lead with normalized data, UTM, consent and an outbox entry', async () => {
    const res = await post(makeApp(), validPayload())
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, status: 'pending_sync', duplicate: false })
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/)
    // Response does not echo personal data.
    expect(JSON.stringify(body)).not.toContain('João')

    const { rows } = await pool.query<Record<string, unknown>>('SELECT * FROM leads WHERE id = $1', [body.id])
    const lead = rows[0]!
    expect(lead).toMatchObject({
      status: 'pending_sync',
      telefone: '+5561991124510',
      email: 'joao@email.com',
      origem: 'Landing Page',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'qualimix',
      consentimento: true,
      crm_external_id: null,
      synced_at: null,
    })
    expect(lead.received_at).toBeInstanceOf(Date)
    expect(lead.ip_hash).toMatch(/^[0-9a-f]{64}$/) // hashed, never the raw IP
    const outbox = await pool.query('SELECT status, attempts FROM crm_outbox WHERE lead_id = $1', [body.id])
    expect(outbox.rows[0]).toEqual({ status: 'pending', attempts: 0 })
  })

  it('returns 422 with field errors for invalid data and stores nothing', async () => {
    const res = await post(makeApp(), validPayload({ telefone: '123', consentimento: false, servico: 'x', nome: '' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('validation_error')
    expect(Object.keys(body.fields).sort()).toEqual(['consentimento', 'nome', 'servico', 'telefone'])
    const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM leads')
    expect(rows[0]!.n).toBe(0)
  })

  it('rejects malformed JSON, wrong content type, arrays and oversize bodies', async () => {
    const app = makeApp()
    expect((await post(app, '{bad json')).status).toBe(400)
    expect((await post(app, '[]')).status).toBe(400)
    expect((await post(app, validPayload(), { 'Content-Type': 'text/plain' })).status).toBe(415)
    expect((await post(app, validPayload({ mensagem: 'x'.repeat(20_000) }))).status).toBe(413)
    expect((await app.request('/api/leads', { method: 'GET' })).status).toBe(405)
  })

  it('treats SQL injection attempts as plain data', async () => {
    const res = await post(makeApp(), validPayload({ mensagem: "'); DROP TABLE leads; -- orçamento" }))
    expect(res.status).toBe(201)
    const { rows } = await pool.query<{ mensagem: string }>('SELECT mensagem FROM leads')
    expect(rows[0]!.mensagem).toContain('DROP TABLE')
  })

  it('is idempotent for the same Idempotency-Key (retry after lost response)', async () => {
    const app = makeApp()
    const payload = validPayload()
    const key = 'abcdefghijklmnop1234'
    const [a, b] = await Promise.all([
      post(app, payload, { 'Idempotency-Key': key }),
      post(app, payload, { 'Idempotency-Key': key }),
    ])
    const ids = [await a.json(), await b.json()].map((x) => x.id)
    expect(ids[0]).toBe(ids[1])
    expect([a.status, b.status].sort()).toEqual([200, 201])
    const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM leads')
    expect(rows[0]!.n).toBe(1)
  })

  it('detects accidental re-submission of identical content without a key', async () => {
    const app = makeApp()
    const payload = validPayload()
    const first = await (await post(app, payload)).json()
    const res = await post(app, payload)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, duplicate: true, id: first.id })
  })

  it('rejects honeypot and too-fast submissions as spam', async () => {
    const app = makeApp()
    expect((await post(app, validPayload({ website: 'http://spam' }))).status).toBe(400)
    expect((await post(app, validPayload({ tempo_preenchimento_ms: 300 }))).status).toBe(400)
    const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM leads')
    expect(rows[0]!.n).toBe(0)
  })

  it('rate limits by IP (memory window) and by phone (persistent)', async () => {
    const app = makeApp({ RATE_LIMIT_MAX: '2' })
    const h = { 'X-Test-Ip': '192.168.0.1' }
    expect((await post(app, validPayload(), h)).status).toBe(201)
    expect((await post(app, validPayload(), h)).status).toBe(201)
    const limited = await post(app, validPayload(), h)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBeTruthy()

    const app2 = makeApp({ RATE_LIMIT_PHONE_PER_DAY: '2' })
    // 2 already stored for this phone above
    expect((await post(app2, validPayload())).status).toBe(429)
  })

  it('returns 503 (no stack, no data) when the database is unavailable', async () => {
    const down: DbPool = {
      query: () => Promise.reject(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })),
      connect: () => Promise.reject(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })),
    }
    const app = makeApp({}, down)
    const res = await post(app, validPayload())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({ ok: false, error: 'service_unavailable', message: expect.any(String) })
    expect((await app.request('/api/health')).status).toBe(503)
  })

  it('returns 500 with a generic message for unexpected errors', async () => {
    const app = makeApp()
    pool.failNext(new Error('boom joao@email.com'))
    const res = await post(app, validPayload())
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('boom')
  })
})

describe('CORS', () => {
  it('allows configured origins and blocks others', async () => {
    const app = makeApp()
    const ok = await app.request('/api/leads', {
      method: 'OPTIONS',
      headers: { Origin: 'https://qualimix.example', 'Access-Control-Request-Method': 'POST' },
    })
    expect(ok.status).toBe(204)
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://qualimix.example')
    const bad = await post(app, validPayload(), { Origin: 'https://evil.example' })
    expect(bad.status).toBe(403)
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('admin routes', () => {
  it('require the bearer token and are disabled without ADMIN_API_TOKEN', async () => {
    const app = makeApp()
    expect((await app.request('/api/admin/leads/stats')).status).toBe(401)
    const ok = await app.request('/api/admin/leads/stats', { headers: { Authorization: 'Bearer admin-test-token' } })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ ok: true, crmConfigured: false })
    expect((await makeApp({ ADMIN_API_TOKEN: '' }).request('/api/admin/leads/stats')).status).toBe(404)
  })
})

describe('GET /api/health', () => {
  it('reports database ok', async () => {
    const res = await makeApp().request('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', database: 'ok' })
  })
})
