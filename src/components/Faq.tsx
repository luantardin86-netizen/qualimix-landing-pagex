import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { FAQ } from '../content/site'
import { CallMeLink, WhatsAppButton } from './Buttons'

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  const baseId = useId()
  return (
    <section id="duvidas" aria-labelledby="duvidas-title" className="scroll-mt-20 bg-card px-5 py-24">
      <div className="mx-auto grid max-w-content gap-12 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold tracking-[0.2em] text-primary uppercase">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" /> Dúvidas frequentes
          </span>
          <h2 id="duvidas-title" className="mt-4 font-display text-3xl font-extrabold tracking-tight md:text-5xl">
            Ficou com <span className="text-primary">alguma dúvida?</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Reunimos as perguntas mais comuns sobre concreto e pisos. Para orçamento, a equipe atende pelo WhatsApp ou retorna o
            seu contato.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <WhatsAppButton>WhatsApp</WhatsAppButton>
            <CallMeLink light={false} />
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-background p-2 md:p-4">
          {FAQ.map((item, i) => {
            const isOpen = open === i
            const buttonId = `${baseId}-q${i}`
            const panelId = `${baseId}-a${i}`
            return (
              <div key={item.q} className="border-b border-border px-4 last:border-b-0">
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left font-display text-base font-bold transition hover:text-primary"
                  >
                    {item.q}
                    <ChevronDown
                      className={`size-5 shrink-0 transition-transform ${isOpen ? 'rotate-180 text-primary' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!isOpen} className="pb-5 text-muted-foreground">
                  {item.a}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
