/**
 * Lead intake use case: validation, normalization, anti-abuse checks and
 * persistence (lead + CRM outbox entry). Framework-agnostic.
 */
import { createHash, createHmac } from 'node:crypto'
import { leadRequestSchema, toFieldErrors, type FieldErrors } from '../../../shared/lead'
import type { AppConfig } from '../config'
import type { Logger } from '../logger'
import type { LeadRepository, LeadStatus, NewLead } from './types'

export interface SubmissionMeta {
  clientIp: string | null
  idempotencyKey: string | null
}

export type SubmitResult =
  | { kind: 'created'; id: string; status: LeadStatus }
  | { kind: 'duplicate'; id: string; status: LeadStatus }
  | { kind: 'invalid'; fields: FieldErrors }
  | { kind: 'spam' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }

export interface LeadServiceDeps {
  repo: LeadRepository
  config: Pick<AppConfig, 'ipHashSecret' | 'minFillTimeMs' | 'duplicateWindowSeconds' | 'rateLimit'>
  logger: Logger
  now?: () => Date
}

const DEFAULT_ORIGIN = 'Landing Page'

export function hashIp(ip: string | null, secret: string): string | null {
  if (!ip || !secret) return null
  return createHmac('sha256', secret).update(ip).digest('hex')
}

export function contentHash(lead: Pick<NewLead, 'nome' | 'sobrenome' | 'telefone' | 'email' | 'empresa' | 'servico' | 'mensagem'>) {
  const parts = [lead.nome, lead.sobrenome, lead.telefone, lead.email ?? '', lead.empresa ?? '', lead.servico, lead.mensagem]
  return createHash('sha256')
    .update(JSON.stringify(parts.map((p) => p.trim().toLowerCase().replace(/\s+/g, ' '))))
    .digest('hex')
}

export function createLeadService({ repo, config, logger, now = () => new Date() }: LeadServiceDeps) {
  return {
    async submit(body: unknown, meta: SubmissionMeta): Promise<SubmitResult> {
      const parsed = leadRequestSchema.safeParse(body)
      if (!parsed.success) {
        return { kind: 'invalid', fields: toFieldErrors(parsed.error) }
      }
      const input = parsed.data

      // Anti-spam: honeypot and minimum fill time.
      if (input.website && input.website.trim() !== '') {
        logger.warn('lead.spam_rejected', { reason: 'honeypot' })
        return { kind: 'spam' }
      }
      if (input.tempo_preenchimento_ms !== undefined && input.tempo_preenchimento_ms < config.minFillTimeMs) {
        logger.warn('lead.spam_rejected', { reason: 'too_fast' })
        return { kind: 'spam' }
      }

      // Idempotent replay of the same submission (e.g. network retry): return the original.
      if (meta.idempotencyKey) {
        const existing = await repo.findByIdempotencyKey(meta.idempotencyKey)
        if (existing) return { kind: 'duplicate', id: existing.id, status: existing.status }
      }

      const lead: NewLead = {
        nome: input.nome,
        sobrenome: input.sobrenome,
        telefone: input.telefone,
        empresa: input.empresa ?? null,
        email: input.email ?? null,
        servico: input.servico,
        mensagem: input.mensagem,
        origem: input.origem ?? DEFAULT_ORIGIN,
        pagina: input.pagina ?? null,
        utm_source: input.utm_source ?? null,
        utm_medium: input.utm_medium ?? null,
        utm_campaign: input.utm_campaign ?? null,
        utm_term: input.utm_term ?? null,
        utm_content: input.utm_content ?? null,
        consentimento: true,
        consentimento_versao: input.consentimento_versao,
        consentimento_em: now(),
        ip_hash: hashIp(meta.clientIp, config.ipHashSecret),
        idempotency_key: meta.idempotencyKey,
        content_hash: '',
      }
      lead.content_hash = contentHash(lead)

      // Accidental re-submission of identical content (new tab, reload, double click without JS guard).
      const sameContent = await repo.findRecentByContentHash(lead.content_hash, config.duplicateWindowSeconds)
      if (sameContent) return { kind: 'duplicate', id: sameContent.id, status: sameContent.status }

      // Persistent abuse limits (work across restarts and multiple instances).
      const perPhone = await repo.countRecentByPhone(lead.telefone, 86_400)
      if (perPhone >= config.rateLimit.maxLeadsPerPhonePerDay) {
        logger.warn('lead.rate_limited', { scope: 'phone' })
        return { kind: 'rate_limited', retryAfterSeconds: 3600 }
      }
      if (lead.ip_hash) {
        const perIp = await repo.countRecentByIpHash(lead.ip_hash, 3600)
        if (perIp >= config.rateLimit.maxLeadsPerIpPerHour) {
          logger.warn('lead.rate_limited', { scope: 'ip' })
          return { kind: 'rate_limited', retryAfterSeconds: 3600 }
        }
      }

      const result = await repo.createWithOutbox(lead)
      if (!result.created) return { kind: 'duplicate', id: result.id, status: result.status }
      logger.info('lead.received', { leadId: result.id, servico: lead.servico, origem: lead.origem, utmSource: lead.utm_source })
      return { kind: 'created', id: result.id, status: result.status }
    },
  }
}

export type LeadService = ReturnType<typeof createLeadService>
