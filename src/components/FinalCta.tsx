import { PHONE_DISPLAY } from '../content/site'
import { CallMeLink, WhatsAppButton } from './Buttons'

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="bg-card px-5 pb-24">
      <div className="bg-red-gradient relative mx-auto max-w-content overflow-hidden rounded-[2rem] px-8 py-16 text-center text-white shadow-2xl shadow-primary/30 md:px-16">
        <div className="absolute -top-20 -left-20 size-72 rounded-full bg-white/10" aria-hidden="true" />
        <div className="absolute -right-16 -bottom-24 size-80 rounded-full bg-black/15" aria-hidden="true" />
        <div className="relative">
          <h2 id="cta-title" className="font-display text-3xl font-black tracking-tight text-balance md:text-5xl">
            Sua obra merece concreto de verdade.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">
            Fale agora com a Qualimix e receba seu orçamento sem compromisso.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <WhatsAppButton variant="white">{PHONE_DISPLAY}</WhatsAppButton>
            <CallMeLink />
          </div>
        </div>
      </div>
    </section>
  )
}
