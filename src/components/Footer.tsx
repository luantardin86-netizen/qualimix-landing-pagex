import { PhoneCall } from 'lucide-react'
import { PHONE_DISPLAY, SERVICE_CARDS, whatsappLink } from '../content/site'
import { Logo } from './Logo'
import { WhatsAppIcon } from './WhatsAppIcon'

export function Footer({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  return (
    <footer className="relative overflow-hidden bg-secondary px-5 pt-16 pb-28 text-white">
      <div className="bg-red-gradient absolute inset-x-0 top-0 h-1.5" aria-hidden="true" />
      <div className="mx-auto grid max-w-content gap-10 md:grid-cols-3">
        <div className="text-2xl">
          <Logo inverted />
          <p className="mt-4 max-w-xs text-sm text-white/60">
            Concreto usinado, piso polido e piso sarrafeado com qualidade, resistência e compromisso com a sua obra.
          </p>
        </div>
        <div>
          <p className="font-display font-bold">Serviços</p>
          <ul className="mt-4 space-y-2 text-sm text-white/60">
            {SERVICE_CARDS.map((s) => (
              <li key={s.title}>
                <a href="#servicos" className="hover:text-white">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-display font-bold">Contato</p>
          <ul className="mt-4 space-y-3 text-sm">
            <li>
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-white/80 hover:text-white"
              >
                <WhatsAppIcon className="size-4 text-whatsapp" /> {PHONE_DISPLAY}
              </a>
            </li>
            <li>
              <a href="#cadastro" className="flex items-center gap-2 text-white/80 hover:text-white">
                <PhoneCall className="size-4 text-primary" aria-hidden="true" /> Quero ser chamado
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-content flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} Qualimix — Qualidade em Concreto. Todos os direitos reservados.</span>
        <button type="button" onClick={onOpenPrivacy} className="text-left underline-offset-4 hover:text-white hover:underline">
          Aviso de privacidade
        </button>
      </div>
    </footer>
  )
}
