import { Ruler, ShieldCheck, Sparkles, Truck } from 'lucide-react'
import { HIGHLIGHTS } from '../content/site'

const ICONS = { truck: Truck, sparkles: Sparkles, ruler: Ruler, shield: ShieldCheck }

export function Highlights() {
  return (
    <section aria-label="Destaques" className="relative z-10 -mt-16 px-5">
      <ul className="mx-auto grid max-w-content gap-4 rounded-3xl bg-card p-4 shadow-2xl shadow-black/10 sm:grid-cols-2 lg:grid-cols-4 lg:p-6">
        {HIGHLIGHTS.map(({ icon, title, text }) => {
          const Icon = ICONS[icon]
          return (
            <li key={title} className="flex items-center gap-4 rounded-2xl p-3 transition hover:bg-accent">
              <div className="bg-red-gradient grid size-14 shrink-0 place-items-center rounded-full text-white shadow-lg shadow-primary/30 ring-4 ring-primary/10">
                <Icon className="size-6" aria-hidden="true" />
              </div>
              <div>
                <p className="font-display font-bold">{title}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
