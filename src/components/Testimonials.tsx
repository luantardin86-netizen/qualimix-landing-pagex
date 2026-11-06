import { BadgeCheck, Quote, Star } from 'lucide-react'
import { TESTIMONIALS } from '../content/site'
import { SectionHeading } from './SectionHeading'

export function Testimonials() {
  return (
    <section id="depoimentos" aria-labelledby="depoimentos-title" className="bg-concrete scroll-mt-20 px-5 py-24">
      <div className="mx-auto max-w-content">
        <SectionHeading
          id="depoimentos-title"
          eyebrow="Depoimentos"
          title={
            <>
              Quem constrói com a Qualimix <span className="text-primary">recomenda</span>
            </>
          }
          subtitle="A satisfação dos nossos clientes é o que dá base para tudo o que fazemos."
        />
        <div className="grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <figure
              key={t.name}
              className={`relative flex flex-col rounded-3xl bg-card p-8 shadow-lg shadow-black/5 transition hover:-translate-y-1 hover:shadow-2xl ${
                i === 1 ? 'md:-translate-y-4 md:hover:-translate-y-5' : ''
              }`}
            >
              <Quote className="absolute top-6 right-6 size-10 text-primary/15" aria-hidden="true" />
              <div className="flex text-amber-400" role="img" aria-label="Avaliação 5 de 5 estrelas">
                {Array.from({ length: 5 }).map((_, k) => (
                  <Star key={k} className="size-5 fill-current" aria-hidden="true" />
                ))}
              </div>
              <blockquote className="mt-5 flex-1 leading-relaxed text-foreground/85">“{t.text}”</blockquote>
              <figcaption className="mt-7 flex items-center gap-3 border-t border-border pt-5">
                <div
                  className="bg-red-gradient grid size-12 place-items-center rounded-full font-display text-lg font-bold text-white"
                  aria-hidden="true"
                >
                  {t.name[0]}
                </div>
                <div>
                  <p className="font-display font-bold">{t.name}</p>
                  <p className="text-sm text-muted-foreground">{t.role}</p>
                </div>
                <BadgeCheck className="ml-auto size-5 text-primary" aria-hidden="true" />
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
