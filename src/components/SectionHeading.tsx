import type { ReactNode } from 'react'

export function SectionHeading({
  id,
  eyebrow,
  title,
  subtitle,
  light = false,
}: {
  id?: string
  eyebrow: string
  title: ReactNode
  subtitle?: string
  light?: boolean
}) {
  return (
    <div className="mx-auto mb-14 max-w-2xl text-center">
      <span
        className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold tracking-[0.2em] uppercase ${
          light ? 'bg-white/10 text-white' : 'bg-primary/10 text-primary'
        }`}
      >
        <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
        {eyebrow}
      </span>
      <h2 id={id} className="mt-4 font-display text-3xl font-extrabold tracking-tight text-balance md:text-5xl">
        {title}
      </h2>
      {subtitle && <p className={`mt-4 text-lg ${light ? 'text-white/70' : 'text-muted-foreground'}`}>{subtitle}</p>}
    </div>
  )
}
