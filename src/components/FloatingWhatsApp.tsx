import { whatsappLink } from '../content/site'
import { WhatsAppIcon } from './WhatsAppIcon'

export function FloatingWhatsApp() {
  return (
    <a
      href={whatsappLink()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a Qualimix no WhatsApp (abre em nova aba)"
      className="fixed right-5 bottom-5 z-30 grid size-14 place-items-center rounded-full bg-whatsapp text-white shadow-xl shadow-black/20 transition hover:scale-105"
    >
      <WhatsAppIcon className="size-7" />
    </a>
  )
}
