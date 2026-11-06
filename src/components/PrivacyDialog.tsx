import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { PRIVACY_NOTICE_VERSION } from '../../shared/lead'
import { PRIVACY_SECTIONS } from '../content/privacy'

export function PrivacyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="privacidade-title"
      className="m-auto w-[min(42rem,calc(100%-2rem))] rounded-3xl bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="max-h-[85vh] overflow-y-auto p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <h2 id="privacidade-title" className="font-display text-2xl font-extrabold">
            Aviso de privacidade
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted"
            aria-label="Fechar aviso de privacidade"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Como a Qualimix trata os dados enviados pelo formulário “Quero ser chamado”.
        </p>
        <div className="mt-6 space-y-5">
          {PRIVACY_SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="font-display font-bold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </section>
          ))}
        </div>
        <p className="mt-6 text-xs text-muted-foreground">Versão do aviso: {PRIVACY_NOTICE_VERSION}</p>
        <button
          type="button"
          onClick={onClose}
          className="bg-red-gradient mt-6 w-full rounded-full px-6 py-3 font-display text-sm font-bold text-white uppercase"
        >
          Entendi
        </button>
      </div>
    </dialog>
  )
}
