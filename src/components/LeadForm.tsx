import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, LoaderCircle, Lock, RotateCcw, Send } from 'lucide-react'
import {
  LIMITS,
  PRIVACY_NOTICE_VERSION,
  SERVICES,
  leadFormSchema,
  toFieldErrors,
  type FieldErrors,
  type LeadRequestBody,
  type Service,
} from '../../shared/lead'
import { formatBrazilianPhone, toNationalNumber } from '../../shared/phone'
import { PHONE_DISPLAY, whatsappLink } from '../content/site'
import { newIdempotencyKey, submitLead, type SubmitOutcome } from '../lib/api'
import { getAttribution } from '../lib/attribution'

type FieldName = 'nome' | 'sobrenome' | 'telefone' | 'empresa' | 'email' | 'servico' | 'mensagem' | 'consentimento'
const FIELD_ORDER: FieldName[] = ['nome', 'sobrenome', 'telefone', 'empresa', 'email', 'servico', 'mensagem', 'consentimento']

interface Values {
  nome: string
  sobrenome: string
  telefone: string
  empresa: string
  email: string
  servico: Service | ''
  mensagem: string
  consentimento: boolean
}

const EMPTY: Values = {
  nome: '',
  sobrenome: '',
  telefone: '',
  empresa: '',
  email: '',
  servico: '',
  mensagem: '',
  consentimento: false,
}

type Banner = { tone: 'error' | 'warning'; text: ReactNode }

function validateField(name: FieldName, value: Values[FieldName]): string | undefined {
  const result = leadFormSchema.shape[name].safeParse(value)
  return result.success ? undefined : result.error.issues[0]?.message
}

const KEEP_DATA = 'Seus dados foram mantidos no formulário.'

function bannerFor(outcome: Exclude<SubmitOutcome, { kind: 'success' }>): Banner {
  switch (outcome.kind) {
    case 'validation':
      return { tone: 'error', text: outcome.message }
    case 'rate_limited':
    case 'rejected':
      return { tone: 'warning', text: outcome.message }
    case 'unavailable':
      return { tone: 'error', text: `${outcome.message} ${KEEP_DATA}` }
    case 'network':
      return {
        tone: 'error',
        text: `Não foi possível conectar ao servidor. Verifique sua internet e tente novamente. ${KEEP_DATA}`,
      }
    case 'not_configured':
      return {
        tone: 'error',
        text: `O envio de cadastros está indisponível no momento. ${KEEP_DATA} Tente novamente mais tarde ou fale com a gente pelo WhatsApp.`,
      }
    case 'unexpected':
      return {
        tone: 'error',
        text: `Ocorreu um erro inesperado (código ${outcome.status}). ${KEEP_DATA} Tente novamente em instantes.`,
      }
  }
}

export function LeadForm({
  preselect,
  onOpenPrivacy,
}: {
  /** Service chosen elsewhere on the page ("Quero ser chamado" on a service card). */
  preselect: { service: Service; token: number } | null
  onOpenPrivacy: () => void
}) {
  const uid = useId()
  const [values, setValues] = useState<Values>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [success, setSuccess] = useState<{ id: string; duplicate: boolean } | null>(null)
  const [website, setWebsite] = useState('') // honeypot

  const inFlight = useRef(false)
  const startedAt = useRef<number | null>(null)
  const idempotency = useRef<{ key: string; fingerprint: string } | null>(null)
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({})
  const bannerRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!preselect) return
    setValues((v) => ({ ...v, servico: preselect.service }))
    setErrors((e) => ({ ...e, servico: undefined }))
    setSuccess(null)
  }, [preselect])

  useEffect(() => {
    if (success) successRef.current?.focus()
  }, [success])

  const id = (name: string) => `${uid}-${name}`
  const set = <K extends FieldName>(name: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [name]: value }))
    // Re-validate as the user fixes an error.
    if (errors[name]) setErrors((e) => ({ ...e, [name]: validateField(name, value) }))
  }
  const blur = (name: FieldName) => {
    const value = values[name]
    const isEmptyOptional = (name === 'empresa' || name === 'email') && value === ''
    if (value === '' && !isEmptyOptional && !errors[name]) return // don't nag on untouched empty fields
    setErrors((e) => ({ ...e, [name]: validateField(name, value) }))
  }
  const markStarted = () => {
    if (startedAt.current === null) startedAt.current = Date.now()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return // blocks double clicks / double Enter before re-render

    const parsed = leadFormSchema.safeParse(values)
    if (!parsed.success) {
      const fieldErrors = toFieldErrors(parsed.error)
      setErrors(fieldErrors)
      setBanner({ tone: 'error', text: 'Revise os campos destacados para continuar.' })
      const first = FIELD_ORDER.find((f) => fieldErrors[f])
      if (first) fieldRefs.current[first]?.focus()
      return
    }

    const attribution = getAttribution()
    const body: LeadRequestBody = {
      nome: values.nome.trim(),
      sobrenome: values.sobrenome.trim(),
      // Normalized national number (DDD + number, digits only); the API normalizes again to E.164.
      telefone: toNationalNumber(values.telefone) ?? values.telefone,
      empresa: values.empresa.trim() || undefined,
      email: values.email.trim() || undefined,
      servico: parsed.data.servico,
      mensagem: values.mensagem.trim(),
      consentimento: true,
      consentimento_versao: PRIVACY_NOTICE_VERSION,
      origem: 'Landing Page',
      ...attribution,
      website,
      tempo_preenchimento_ms: startedAt.current ? Date.now() - startedAt.current : undefined,
    }

    // Same data => same key, so a retry after a lost response never creates a second lead.
    const fingerprint = JSON.stringify({ ...body, tempo_preenchimento_ms: undefined })
    if (!idempotency.current || idempotency.current.fingerprint !== fingerprint) {
      idempotency.current = { key: newIdempotencyKey(), fingerprint }
    }

    inFlight.current = true
    setSubmitting(true)
    setBanner(null)
    try {
      const outcome = await submitLead(body, idempotency.current.key)
      if (outcome.kind === 'success') {
        setSuccess({ id: outcome.id, duplicate: outcome.duplicate })
        return
      }
      if (outcome.kind === 'validation') setErrors(outcome.fields)
      setBanner(bannerFor(outcome))
      requestAnimationFrame(() => bannerRef.current?.focus())
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  function reset() {
    setValues(EMPTY)
    setErrors({})
    setBanner(null)
    setSuccess(null)
    setWebsite('')
    idempotency.current = null
    startedAt.current = null
  }

  if (success) {
    return (
      <div className="flex min-h-[28rem] flex-col items-center justify-center text-center" role="status" aria-live="polite">
        <div className="grid size-16 place-items-center rounded-full bg-success/10 text-success">
          <CircleCheck className="size-9" aria-hidden="true" />
        </div>
        <h3 ref={successRef} tabIndex={-1} className="mt-5 font-display text-2xl font-extrabold outline-none">
          {success.duplicate ? 'Seu cadastro já estava registrado!' : 'Cadastro recebido!'}
        </h3>
        <p className="mt-3 max-w-sm text-muted-foreground">
          Obrigado. Um de nossos consultores vai entrar em contato pelo telefone informado, em horário comercial.
        </p>
        <p className="mt-4 rounded-full bg-muted px-4 py-1.5 font-mono text-xs text-muted-foreground">
          Protocolo: {success.id.slice(0, 8).toUpperCase()}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href={whatsappLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-whatsapp px-5 py-3 text-sm font-bold text-white"
          >
            Falar agora no WhatsApp
          </a>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-semibold hover:bg-muted"
          >
            <RotateCcw className="size-4" aria-hidden="true" /> Enviar outra solicitação
          </button>
        </div>
      </div>
    )
  }

  const err = (name: FieldName) =>
    errors[name] ? (
      <p id={id(`${name}-erro`)} className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-destructive">
        <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
        {errors[name]}
      </p>
    ) : null
  const a11y = (name: FieldName, hint?: string) => ({
    id: id(name),
    name,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': [errors[name] ? id(`${name}-erro`) : '', hint ?? ''].filter(Boolean).join(' ') || undefined,
    ref: (el: HTMLElement | null) => {
      fieldRefs.current[name] = el
    },
  })

  return (
    <form noValidate onSubmit={handleSubmit} onFocus={markStarted} aria-labelledby={id('titulo')} aria-busy={submitting}>
      <h3 id={id('titulo')} className="font-display text-2xl font-extrabold">
        Solicite nosso contato
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Leva menos de 1 minuto. Campos com <span className="text-primary">*</span> são obrigatórios.
      </p>

      {banner && (
        <div
          ref={bannerRef}
          tabIndex={-1}
          role="alert"
          className={`mt-5 flex gap-3 rounded-2xl border p-4 text-sm outline-none ${
            banner.tone === 'error'
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">{banner.text}</p>
            {banner.tone === 'error' && (
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-semibold underline underline-offset-2"
              >
                Prefere falar agora? WhatsApp {PHONE_DISPLAY}
              </a>
            )}
          </div>
        </div>
      )}

      <fieldset disabled={submitting} className="mt-6 grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Seus dados de contato</legend>
        <div>
          <Label htmlFor={id('nome')} required>
            Nome
          </Label>
          <input
            {...a11y('nome')}
            className="field"
            type="text"
            autoComplete="given-name"
            maxLength={LIMITS.nome}
            required
            value={values.nome}
            onChange={(e) => set('nome', e.target.value)}
            onBlur={() => blur('nome')}
          />
          {err('nome')}
        </div>
        <div>
          <Label htmlFor={id('sobrenome')} required>
            Sobrenome
          </Label>
          <input
            {...a11y('sobrenome')}
            className="field"
            type="text"
            autoComplete="family-name"
            maxLength={LIMITS.sobrenome}
            required
            value={values.sobrenome}
            onChange={(e) => set('sobrenome', e.target.value)}
            onBlur={() => blur('sobrenome')}
          />
          {err('sobrenome')}
        </div>
        <div>
          <Label htmlFor={id('telefone')} required>
            Telefone / WhatsApp
          </Label>
          <input
            {...a11y('telefone')}
            className="field"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(61) 99999-9999"
            maxLength={16}
            required
            value={values.telefone}
            onChange={(e) => set('telefone', formatBrazilianPhone(e.target.value))}
            onBlur={() => blur('telefone')}
          />
          {err('telefone')}
        </div>
        <div>
          <Label htmlFor={id('servico')} required>
            Serviço de interesse
          </Label>
          <select
            {...a11y('servico')}
            className="field appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23666%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:1.1rem] bg-[right_0.9rem_center] bg-no-repeat pr-10"
            required
            value={values.servico}
            onChange={(e) => set('servico', e.target.value as Service | '')}
            onBlur={() => blur('servico')}
          >
            <option value="">Selecione…</option>
            {SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {err('servico')}
        </div>
        <div>
          <Label htmlFor={id('empresa')}>Empresa</Label>
          <input
            {...a11y('empresa')}
            className="field"
            type="text"
            autoComplete="organization"
            maxLength={LIMITS.empresa}
            value={values.empresa}
            onChange={(e) => set('empresa', e.target.value)}
            onBlur={() => blur('empresa')}
          />
          {err('empresa')}
        </div>
        <div>
          <Label htmlFor={id('email')}>E-mail</Label>
          <input
            {...a11y('email')}
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={LIMITS.email}
            value={values.email}
            onChange={(e) => set('email', e.target.value)}
            onBlur={() => blur('email')}
          />
          {err('email')}
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={id('mensagem')} required>
            Conte sobre sua obra
          </Label>
          <textarea
            {...a11y('mensagem', id('mensagem-dica'))}
            className="field min-h-28 resize-y"
            rows={4}
            maxLength={LIMITS.mensagem}
            required
            placeholder="Ex.: laje de 60 m² em Taguatinga, preciso de concreto usinado para o próximo mês."
            value={values.mensagem}
            onChange={(e) => set('mensagem', e.target.value)}
            onBlur={() => blur('mensagem')}
          />
          <div className="mt-1 flex justify-between gap-3 text-xs text-muted-foreground">
            <span id={id('mensagem-dica')}>Tipo de serviço, metragem ou volume aproximado e cidade da obra.</span>
            <span aria-hidden="true">
              {values.mensagem.length}/{LIMITS.mensagem}
            </span>
          </div>
          {err('mensagem')}
        </div>

        {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
        <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor={id('website')}>Site</label>
          <input
            id={id('website')}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <div className="flex items-start gap-3">
            <input
              {...a11y('consentimento')}
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-primary"
              checked={values.consentimento}
              onChange={(e) => set('consentimento', e.target.checked)}
            />
            <label htmlFor={id('consentimento')} className="text-sm leading-relaxed text-foreground/85">
              Concordo que a Qualimix utilize os dados acima para entrar em contato comigo sobre esta solicitação, conforme o{' '}
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="font-semibold text-primary underline underline-offset-2"
              >
                aviso de privacidade
              </button>
              . <span className="text-primary">*</span>
            </label>
          </div>
          {err('consentimento')}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={submitting}
        className="bg-red-gradient mt-7 inline-flex w-full items-center justify-center gap-2.5 rounded-full px-6 py-4 font-display text-sm font-bold tracking-wide text-white uppercase shadow-lg shadow-primary/30 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:cursor-wait disabled:opacity-80"
      >
        {submitting ? (
          <>
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> Enviando…
          </>
        ) : (
          <>
            <Send className="size-5" aria-hidden="true" /> Solicitar contato
          </>
        )}
      </button>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden="true" /> Seus dados são usados apenas para o nosso contato.
      </p>
      <p className="sr-only" aria-live="polite">
        {submitting ? 'Enviando seu cadastro, aguarde.' : ''}
      </p>
    </form>
  )
}

function Label({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold">
      {children}
      {required ? (
        <span className="text-primary" aria-hidden="true">
          {' '}
          *
        </span>
      ) : (
        <span className="font-normal text-muted-foreground"> (opcional)</span>
      )}
    </label>
  )
}
