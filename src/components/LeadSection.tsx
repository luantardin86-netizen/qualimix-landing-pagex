import { Clock, ShieldCheck } from 'lucide-react'
import type { Service } from '../../shared/lead'
import { PHONE_DISPLAY } from '../content/site'
import { WhatsAppButton } from './Buttons'
import { LeadForm } from './LeadForm'

export function LeadSection({
  preselect,
  onOpenPrivacy,
}: {
  preselect: { service: Service; token: number } | null
  onOpenPrivacy: () => void
}) {
  return (
    <section id="cadastro" aria-labelledby="cadastro-title" className="relative scroll-mt-20 overflow-hidden bg-secondary px-5 py-24 text-white">
      <div className="bg-red-gradient absolute -bottom-40 -left-40 size-[28rem] rounded-full opacity-20 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-content items-start gap-12 lg:grid-cols-[1fr_1.15fr]">
        <div className="lg:sticky lg:top-28">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold tracking-[0.2em] uppercase">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" /> Cadastro de cliente
          </span>
          <h2 id="cadastro-title" className="mt-4 font-display text-3xl font-extrabold tracking-tight text-balance md:text-5xl">
            Deixe seu contato e <span className="text-primary">a gente te chama</span>
          </h2>
          <p className="mt-4 text-lg text-white/75">
            Conte rapidamente o que você precisa. Um de nossos consultores vai chamar você para entender sua obra e montar o
            orçamento.
          </p>
          <ul className="mt-8 space-y-3 text-white/85">
            <li className="flex items-center gap-3">
              <Clock className="size-5 text-primary" aria-hidden="true" /> Retorno rápido, em horário comercial
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" /> Seus dados são usados apenas para o nosso contato
            </li>
          </ul>
          <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="font-display text-lg font-bold">Quer falar agora mesmo?</p>
            <p className="mt-1 text-sm text-white/70">
              Sem esperar: chame nossa equipe direto no WhatsApp <span className="font-semibold text-white">{PHONE_DISPLAY}</span>.
            </p>
            <WhatsAppButton className="mt-5">Falar agora no WhatsApp</WhatsAppButton>
          </div>
        </div>
        <div className="rounded-3xl bg-card p-6 text-foreground shadow-2xl shadow-black/30 md:p-9">
          <LeadForm preselect={preselect} onOpenPrivacy={onOpenPrivacy} />
        </div>
      </div>
    </section>
  )
}
