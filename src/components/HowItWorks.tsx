import { CircleCheck, FileText, MessageCircle, Truck } from 'lucide-react'
import { STEPS } from '../content/site'
import { WhatsAppButton } from './Buttons'
import { SectionHeading } from './SectionHeading'

const ICONS = { message: MessageCircle, file: FileText, truck: Truck, check: CircleCheck }

export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="como-funciona-title"
      className="relative scroll-mt-20 overflow-hidden bg-secondary px-5 py-24 text-white"
    >
      <div className="bg-red-gradient absolute -top-32 -right-32 size-96 rounded-full opacity-20 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto max-w-content">
        <SectionHeading
          id="como-funciona-title"
          light
          eyebrow="Como funciona"
          title={
            <>
              Do orçamento à entrega em <span className="text-primary">4 passos</span>
            </>
          }
          subtitle="Simples, rápido e transparente — do jeito que sua obra merece."
        />
        <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon, title, text }, i) => {
            const Icon = ICONS[icon]
            return (
              <li
                key={title}
                className="relative rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur transition hover:border-primary/60 hover:bg-white/10"
              >
                <span className="absolute top-5 right-6 font-display text-5xl font-black text-white/10" aria-hidden="true">
                  0{i + 1}
                </span>
                <div className="bg-red-gradient grid size-12 place-items-center rounded-2xl shadow-lg shadow-primary/40">
                  <Icon className="size-6" aria-hidden="true" />
                </div>
                <h3 className="mt-5 font-display text-lg font-bold">
                  <span className="sr-only">Passo {i + 1}: </span>
                  {title}
                </h3>
                <p className="mt-2 text-sm text-white/70">{text}</p>
              </li>
            )
          })}
        </ol>
        <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <WhatsAppButton>Começar agora</WhatsAppButton>
          <a
            href="#cadastro"
            className="inline-flex items-center justify-center rounded-full px-6 py-3.5 font-display text-sm font-bold tracking-wide text-white/80 uppercase underline-offset-4 hover:text-white hover:underline"
          >
            ou deixe seu contato
          </a>
        </div>
      </div>
    </section>
  )
}
