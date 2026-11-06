/**
 * HTTP API (Hono). Runtime-agnostic: the same app runs on Node
 * (server/src/index.ts) or any Fetch-API runtime via `app.fetch`.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import type { LeadApiResponse } from '../../../shared/lead'
import type { AppConfig } from '../config'
import type { CrmSyncService } from '../crm/crmSyncService'
import { isDatabaseUnavailable } from '../db/pool'
import type { LeadService } from '../leads/leadService'
import type { LeadRepository, OutboxRepository } from '../leads/types'
import { describeError, type Logger } from '../logger'
import { strictCors } from './cors'
import { createMemoryRateLimiter, type RateLimiter } from './rateLimiter'

export interface AppDeps {
  config: AppConfig
  logger: Logger
  leadService: LeadService
  leadRepo: Pick<LeadRepository, 'ping'>
  outbox?: OutboxRepository
  crmSync?: CrmSyncService
  /** Returns the client IP for rate limiting, or null when unknown. */
  getClientIp?: (c: Context) => string | null
  rateLimiter?: RateLimiter
  /** Called after a lead is stored (e.g. to trigger a sync in the background). */
  onLeadCreated?: (leadId: string) => void
}

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{16,80}$/

const MESSAGES = {
  created: 'Cadastro recebido com sucesso. Em breve um consultor entrará em contato.',
  duplicate: 'Este cadastro já havia sido recebido. Em breve um consultor entrará em contato.',
  invalid: 'Alguns campos precisam ser corrigidos.',
  invalidJson: 'Não foi possível ler os dados enviados.',
  unsupported: 'Formato de envio não suportado.',
  tooLarge: 'Os dados enviados excedem o tamanho permitido.',
  spam: 'Não foi possível processar o envio. Se o problema persistir, fale conosco pelo WhatsApp.',
  rateLimited: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
  unavailable: 'Não foi possível registrar seu cadastro agora. Tente novamente em instantes.',
  internal: 'Ocorreu um erro inesperado. Tente novamente em instantes.',
} as const

function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export function createApp(deps: AppDeps) {
  const { config, logger, leadService } = deps
  const limiter = deps.rateLimiter ?? createMemoryRateLimiter(config.rateLimit.windowMs, config.rateLimit.maxPerWindow)
  const getClientIp = deps.getClientIp ?? (() => null)

  const app = new Hono()

  app.use('/api/*', async (c, next) => {
    const id = randomUUID()
    const started = Date.now()
    c.header('X-Request-Id', id)
    await next()
    logger.info('http.request', { requestId: id, method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - started })
  })
  app.use('/api/*', secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }))
  app.use('/api/*', strictCors(config.allowedOrigins))
  app.use('/api/*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

  // ---------------------------------------------------------------- health
  app.get('/api/health', async (c) => {
    try {
      await deps.leadRepo.ping()
      return c.json({ status: 'ok', database: 'ok' })
    } catch (error) {
      logger.error('health.database_unavailable', describeError(error))
      return c.json({ status: 'degraded', database: 'unavailable' }, 503)
    }
  })

  // ----------------------------------------------------------------- leads
  app.post(
    '/api/leads',
    async (c, next) => {
      const ip = getClientIp(c)
      if (ip) {
        const retryAfter = limiter.hit(`leads:${ip}`)
        if (retryAfter > 0) {
          c.header('Retry-After', String(retryAfter))
          return c.json<LeadApiResponse>(
            { ok: false, error: 'rate_limited', message: MESSAGES.rateLimited, retryAfterSeconds: retryAfter },
            429,
          )
        }
      }
      return next()
    },
    bodyLimit({
      maxSize: config.maxBodyBytes,
      onError: (c) => c.json<LeadApiResponse>({ ok: false, error: 'payload_too_large', message: MESSAGES.tooLarge }, 413),
    }),
    async (c) => {
      const contentType = c.req.header('Content-Type') ?? ''
      if (!/^application\/json\b/i.test(contentType)) {
        return c.json<LeadApiResponse>({ ok: false, error: 'unsupported_media_type', message: MESSAGES.unsupported }, 415)
      }

      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return c.json<LeadApiResponse>({ ok: false, error: 'invalid_json', message: MESSAGES.invalidJson }, 400)
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return c.json<LeadApiResponse>({ ok: false, error: 'invalid_json', message: MESSAGES.invalidJson }, 400)
      }

      const idempotencyKey = c.req.header('Idempotency-Key')?.trim() || null
      if (idempotencyKey && !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
        return c.json<LeadApiResponse>(
          { ok: false, error: 'invalid_idempotency_key', message: MESSAGES.invalidJson },
          400,
        )
      }

      const result = await leadService.submit(body, { clientIp: getClientIp(c), idempotencyKey })
      switch (result.kind) {
        case 'created':
          deps.onLeadCreated?.(result.id)
          return c.json<LeadApiResponse>(
            { ok: true, id: result.id, status: result.status, duplicate: false, message: MESSAGES.created },
            201,
          )
        case 'duplicate':
          return c.json<LeadApiResponse>(
            { ok: true, id: result.id, status: result.status, duplicate: true, message: MESSAGES.duplicate },
            200,
          )
        case 'invalid':
          return c.json<LeadApiResponse>(
            { ok: false, error: 'validation_error', message: MESSAGES.invalid, fields: result.fields },
            422,
          )
        case 'spam':
          return c.json<LeadApiResponse>({ ok: false, error: 'rejected', message: MESSAGES.spam }, 400)
        case 'rate_limited':
          c.header('Retry-After', String(result.retryAfterSeconds))
          return c.json<LeadApiResponse>(
            { ok: false, error: 'rate_limited', message: MESSAGES.rateLimited, retryAfterSeconds: result.retryAfterSeconds },
            429,
          )
      }
    },
  )
  app.all('/api/leads', (c) => {
    c.header('Allow', 'POST, OPTIONS')
    return c.json({ ok: false, error: 'method_not_allowed', message: 'Método não permitido.' }, 405)
  })

  // ----------------------------------------------------------------- admin
  // Disabled (404) unless ADMIN_API_TOKEN is configured on the server.
  app.use('/api/admin/*', async (c, next) => {
    if (!config.adminApiToken) return c.json({ ok: false, error: 'not_found' }, 404)
    const header = c.req.header('Authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token || !tokenMatches(token, config.adminApiToken)) {
      return c.json({ ok: false, error: 'unauthorized' }, 401)
    }
    return next()
  })

  app.get('/api/admin/leads/stats', async (c) => {
    if (!deps.outbox) return c.json({ ok: false, error: 'not_available' }, 501)
    const byStatus = await deps.outbox.countByStatus()
    return c.json({ ok: true, byStatus, crmConfigured: config.crm.apiUrl !== '' })
  })

  app.post('/api/admin/crm-sync', async (c) => {
    if (!deps.crmSync) return c.json({ ok: false, error: 'not_available' }, 501)
    const summary = await deps.crmSync.runOnce()
    return c.json({ ok: true, summary })
  })

  app.post('/api/admin/crm-sync/requeue-failed', async (c) => {
    if (!deps.outbox) return c.json({ ok: false, error: 'not_available' }, 501)
    const requeued = await deps.outbox.requeueFailed()
    return c.json({ ok: true, requeued })
  })

  // ------------------------------------------------------------- fallbacks
  app.notFound((c) => c.json({ ok: false, error: 'not_found', message: 'Recurso não encontrado.' }, 404))

  app.onError((error, c) => {
    if (isDatabaseUnavailable(error)) {
      logger.error('db.unavailable', { path: c.req.path, ...describeError(error) })
      c.header('Retry-After', '30')
      return c.json<LeadApiResponse>({ ok: false, error: 'service_unavailable', message: MESSAGES.unavailable }, 503)
    }
    logger.error('http.unhandled_error', { path: c.req.path, ...describeError(error) })
    return c.json<LeadApiResponse>({ ok: false, error: 'internal_error', message: MESSAGES.internal }, 500)
  })

  return app
}

export type App = ReturnType<typeof createApp>
