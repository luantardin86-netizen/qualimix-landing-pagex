export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex flex-col leading-none">
      <span className="font-display text-[1.75em] font-black tracking-tight italic">
        <span className="text-primary">Quali</span>
        <span className={inverted ? 'text-white' : 'text-secondary'}>mix</span>
      </span>
      <span
        className={`mt-1 flex items-center gap-1.5 text-[0.5em] font-semibold tracking-[0.22em] uppercase ${
          inverted ? 'text-white/70' : 'text-muted-foreground'
        }`}
      >
        <span className="h-px w-5 bg-primary" aria-hidden="true" />
        Qualidade em concreto
      </span>
    </span>
  )
}
