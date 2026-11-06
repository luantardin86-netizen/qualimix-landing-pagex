/**
 * Lead contract shared by the landing page form and the backend API.
 * The backend ALWAYS re-validates with this schema — frontend validation is
 * only a usability layer.
 */
import { z } from 'zod'
import { normalizeBrazilianPhone } from './phone'

export const SERVICES = ['Concreto usinado', 'Piso polido', 'Piso sarrafeado', 'Outro / ainda não sei'] as const
export type Service = (typeof SERVICES)[number]

/**
 * Version of the privacy notice the visitor agreed to. Bump it whenever the
 * text in `src/content/privacy.ts` changes so each lead records exactly which
 * version was presented.
 */
export const PRIVACY_NOTICE_VERSION = '2026-11-06.v1'

export const LIMITS = {
  nome: 60,
  sobrenome: 80,
  empresa: 120,
  email: 160,
  mensagem: 1500,
  utm: 150,
  pagina: 300,
} as const

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const optionalText = (max: number, label: string) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string({ error: `${label} inválido.` })
      .trim()
      .max(max, { error: `${label} deve ter no máximo ${max} caracteres.` })
      .optional(),
  )

const personName = (max: number, label: string) =>
  z
    .string({ error: `Informe o ${label.toLowerCase()}.` })
    .trim()
    .min(2, { error: `${label} deve ter pelo menos 2 letras.` })
    .max(max, { error: `${label} deve ter no máximo ${max} caracteres.` })
    .regex(/^[\p{L}\p{M}' .-]+$/u, { error: `${label} deve conter apenas letras.` })
    .transform((v) => v.replace(/\s+/g, ' '))

/** Fields filled in by the visitor. */
export const leadFormSchema = z.object({
  nome: personName(LIMITS.nome, 'Nome'),
  sobrenome: personName(LIMITS.sobrenome, 'Sobrenome'),
  telefone: z
    .string({ error: 'Informe o telefone.' })
    .trim()
    .min(1, { error: 'Informe o telefone.' })
    .transform((value, ctx) => {
      const normalized = normalizeBrazilianPhone(value)
      if (!normalized) {
        ctx.addIssue({ code: 'custom', message: 'Informe um telefone válido com DDD.' })
        return z.NEVER
      }
      return normalized
    }),
  empresa: optionalText(LIMITS.empresa, 'Empresa'),
  email: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .toLowerCase()
      .max(LIMITS.email, { error: 'E-mail muito longo.' })
      .pipe(z.email({ error: 'Informe um e-mail válido.' }))
      .optional(),
  ),
  servico: z.enum(SERVICES, { error: 'Selecione o serviço de interesse.' }),
  mensagem: z
    .string({ error: 'Descreva sua necessidade.' })
    .trim()
    .min(10, { error: 'Conte um pouco mais sobre sua obra (mínimo de 10 caracteres).' })
    .max(LIMITS.mensagem, { error: `A mensagem deve ter no máximo ${LIMITS.mensagem} caracteres.` }),
  consentimento: z.literal(true, { error: 'É necessário concordar com o aviso de privacidade para enviar.' }),
})

/** Full request body accepted by `POST /api/leads`. */
export const leadRequestSchema = leadFormSchema.extend({
  consentimento_versao: z.string({ error: 'Versão do aviso de privacidade ausente.' }).trim().min(1).max(40),
  origem: optionalText(60, 'Origem'),
  pagina: optionalText(LIMITS.pagina, 'Página'),
  utm_source: optionalText(LIMITS.utm, 'utm_source'),
  utm_medium: optionalText(LIMITS.utm, 'utm_medium'),
  utm_campaign: optionalText(LIMITS.utm, 'utm_campaign'),
  utm_term: optionalText(LIMITS.utm, 'utm_term'),
  utm_content: optionalText(LIMITS.utm, 'utm_content'),
  /** Honeypot: must stay empty. Real visitors never see this field. */
  website: z.string().max(200).optional(),
  /** Milliseconds between the first interaction with the form and submission. */
  tempo_preenchimento_ms: z.number().int().nonnegative().max(86_400_000).optional(),
})

export type LeadFormInput = z.input<typeof leadFormSchema>
export type LeadRequestBody = z.input<typeof leadRequestSchema>
export type LeadRequest = z.output<typeof leadRequestSchema>

export type FieldErrors = Partial<Record<string, string>>

/** Converts zod issues to `{ field: firstMessage }`. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_')
    if (!out[key]) out[key] = issue.message
  }
  return out
}

/** Shape of the JSON responses returned by `POST /api/leads`. */
export type LeadApiResponse =
  | { ok: true; id: string; status: string; duplicate: boolean; message: string }
  | { ok: false; error: string; message: string; fields?: FieldErrors; retryAfterSeconds?: number }
