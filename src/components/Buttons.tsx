import type { ReactNode } from 'react'
import { PhoneCall } from 'lucide-react'
import { whatsappLink } from '../content/site'
import { WhatsAppIcon } from './WhatsAppIcon'

const base =
  'inline-flex items-center justify-center gap-2.5 rounded-full px-6 py-3.5 font-display text-sm font-bold tracking-wide uppercase transition-all duration-200 hover:-translate-y-0.5 motion-reduce:transition-none'

export function WhatsAppButton({
  children = 'Fale no WhatsApp',
  message,
  variant = 'red',
  className = '',
}: {
  children?: ReactNode
  message?: string
  variant?: 'red' | 'white'
  className?: string
}) {
  const styles =
    variant === 'white'
      ? 'bg-white text-primary shadow-lg shadow-black/15 hover:shadow-xl'
      : 'bg-red-gradient text-white shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40'
  return (
    <a href={whatsappLink(message)} target="_blank" rel="noopener noreferrer" className={`${base} ${styles} ${className}`}>
      <WhatsAppIcon className="size-5" />
      {children}
      <span className="sr-only"> (abre o WhatsApp em nova aba)</span>
    </a>
  )
}

export function CallMeLink({ light = true, className = '' }: { light?: boolean; className?: string }) {
  const styles = light
    ? 'border-2 border-white/40 text-white hover:border-white hover:bg-white/10'
    : 'border-2 border-secondary/20 text-secondary hover:border-secondary hover:bg-secondary/5'
  return (
    <a href="#cadastro" className={`${base} ${styles} ${className}`}>
      <PhoneCall className="size-5" aria-hidden="true" />
      Quero ser chamado
    </a>
  )
}
