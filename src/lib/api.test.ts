import { describe, expect, it } from 'vitest'
import { submitLead } from './api'

const json = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch

describe('submitLead (frontend client)', () => {
  it('reports success only when the backend confirms with an id', async () => {
    const r = await submitLead({} as never, 'k'.repeat(20), {
      fetchImpl: json(201, { ok: true, id: 'abc', status: 'pending_sync', duplicate: false, message: 'ok' }),
    })
    expect(r).toMatchObject({ kind: 'success', id: 'abc' })
    expect((await submitLead({} as never, 'k', { fetchImpl: json(200, { ok: true }) })).kind).toBe('unexpected')
  })
  it('maps failures', async () => {
    expect((await submitLead({} as never, 'k', { fetchImpl: json(422, { ok: false, fields: { nome: 'x' }, message: 'm' }) })).kind).toBe('validation')
    expect((await submitLead({} as never, 'k', { fetchImpl: json(503, { ok: false, message: 'm' }) })).kind).toBe('unavailable')
    expect((await submitLead({} as never, 'k', { fetchImpl: json(429, { ok: false, message: 'm' }) })).kind).toBe('rate_limited')
    const offline = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    expect((await submitLead({} as never, 'k', { fetchImpl: offline })).kind).toBe('network')
    // Static host without backend answers HTML 404 -> "not configured", never success.
    const html = (async () => new Response('<html>', { status: 404, headers: { 'Content-Type': 'text/html' } })) as typeof fetch
    expect((await submitLead({} as never, 'k', { fetchImpl: html })).kind).toBe('not_configured')
  })
})
