import { ArrowRight, PhoneCall } from 'lucide-react'
import type { Service } from '../../shared/lead'
import { SERVICE_CARDS, whatsappLink } from '../content/site'
import { SectionHeading } from './SectionHeading'

export function Services({ onRequestCall }: { onRequestCall: (service: Service) => void }) {
  return (
    <section id="servicos" aria-labelledby="servicos-title" className="bg-concrete scroll-mt-20 px-5 py-24">
      <div className="mx-auto max-w-content">
        <SectionHeading
          id="servicos-title"
          eyebrow="Nossos serviços"
          title={
            <>
              Tudo o que sua obra precisa <span className="text-primary">em concreto</span>
            </>
          }
          subtitle="Da fundação ao acabamento do piso, você conta com uma equipe que entende de obra e entrega no prazo."
        />
        <div className="grid gap-6 md:grid-cols-3">
          {SERVICE_CARDS.map((s) => (
            <article
              key={s.title}
              className="group flex flex-col overflow-hidden rounded-3xl bg-card shadow-lg shadow-black/5 transition duration-300 hover:-translate-y-1.5 hover:shadow-2xl"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={`/img/${s.image}-800.webp`}
                  srcSet={`/img/${s.image}-480.webp 480w, /img/${s.image}-800.webp 800w`}
                  sizes="(min-width: 768px) 33vw, 100vw"
                  width={800}
                  height={436}
                  alt={s.alt}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" aria-hidden="true" />
                <h3 className="absolute bottom-4 left-5 font-display text-2xl font-extrabold text-white">{s.title}</h3>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <p className="flex-1 text-muted-foreground">{s.description}</p>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <a
                    href={whatsappLink(s.whatsappMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 font-display text-sm font-bold text-primary uppercase"
                  >
                    Pedir orçamento
                    <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden="true" />
                    <span className="sr-only"> de {s.title} pelo WhatsApp</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => onRequestCall(s.title)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-secondary/80 transition hover:bg-accent hover:text-primary"
                  >
                    <PhoneCall className="size-4" aria-hidden="true" />
                    Quero ser chamado
                    <span className="sr-only"> sobre {s.title}</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
