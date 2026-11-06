import { ShieldCheck, Star, Zap } from 'lucide-react'
import { CallMeLink, WhatsAppButton } from './Buttons'

export function Hero() {
  return (
    <section id="topo" aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-secondary text-white">
      <img
        src="/img/hero-truck-1280.webp"
        srcSet="/img/hero-truck-768.webp 768w, /img/hero-truck-1280.webp 1280w, /img/hero-truck-1376.webp 1376w"
        sizes="100vw"
        width={1376}
        height={768}
        alt="Caminhão betoneira lançando concreto em obra"
        className="absolute inset-0 -z-20 h-full w-full object-cover object-[70%_center]"
        fetchPriority="high"
        decoding="async"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/80 to-black/20" aria-hidden="true" />
      <div className="bg-red-gradient absolute -bottom-24 -left-20 -z-10 h-48 w-[140%] -rotate-[4deg] opacity-95" aria-hidden="true" />
      <div className="absolute -bottom-28 -left-10 -z-10 h-48 w-[140%] -rotate-[4deg] bg-background" aria-hidden="true" />

      <div className="mx-auto grid min-h-[92svh] max-w-content items-center px-5 pt-28 pb-36">
        <div className="max-w-2xl">
          <span className="inline-flex animate-float-in items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wider uppercase backdrop-blur">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" /> Qualidade em concreto
          </span>
          <h1
            id="hero-title"
            className="mt-6 animate-float-in font-display text-4xl leading-[1.05] font-black tracking-tight text-balance sm:text-5xl md:text-7xl"
            style={{ animationDelay: '80ms' }}
          >
            Concreto forte para <span className="text-primary">obras que duram</span>.
          </h1>
          <p className="mt-6 max-w-xl animate-float-in text-lg text-white/80 md:text-xl" style={{ animationDelay: '160ms' }}>
            Concreto usinado, piso polido e piso sarrafeado com controle de qualidade, entrega pontual e atendimento próximo
            do início ao fim da sua obra.
          </p>
          <div className="mt-9 flex animate-float-in flex-col gap-3 sm:flex-row" style={{ animationDelay: '240ms' }}>
            <WhatsAppButton>Solicite seu orçamento</WhatsAppButton>
            <CallMeLink />
          </div>
          <div
            className="mt-10 flex animate-float-in flex-wrap items-center gap-x-6 gap-y-3 text-sm text-white/75"
            style={{ animationDelay: '320ms' }}
          >
            <span className="flex items-center gap-2">
              <span className="flex text-amber-400" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-4 fill-current" />
                ))}
              </span>
              Clientes satisfeitos
            </span>
            <span className="flex items-center gap-2">
              <Zap className="size-4 text-primary" aria-hidden="true" /> Resposta rápida no WhatsApp
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
