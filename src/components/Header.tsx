import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { NAV_LINKS } from '../content/site'
import { WhatsAppButton } from './Buttons'
import { Logo } from './Logo'

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const solid = scrolled || open
  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
        solid ? 'bg-white/95 shadow-md shadow-black/5 backdrop-blur' : 'bg-transparent'
      }`}
    >
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Pular para o conteúdo
      </a>
      <div className="mx-auto flex h-18 max-w-content items-center justify-between px-5">
        <a href="#topo" aria-label="Qualimix — início" className="text-xl">
          <Logo inverted={!solid} />
        </a>
        <nav aria-label="Principal" className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`text-sm font-semibold transition-colors hover:text-primary ${solid ? 'text-secondary' : 'text-white/90'}`}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="hidden md:block">
          <WhatsAppButton className="!px-5 !py-2.5">Orçamento</WhatsAppButton>
        </div>
        <button
          type="button"
          className={`grid size-11 place-items-center rounded-full md:hidden ${solid ? 'text-secondary' : 'text-white'}`}
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-6" aria-hidden="true" /> : <Menu className="size-6" aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <nav id="menu-mobile" aria-label="Menu móvel" className="border-t border-border bg-white px-5 pb-5 md:hidden">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block border-b border-border py-3 font-semibold text-secondary"
            >
              {link.label}
            </a>
          ))}
          <WhatsAppButton className="mt-4 w-full">Solicitar orçamento</WhatsAppButton>
        </nav>
      )}
    </header>
  )
}
