import { useCallback, useState } from 'react'
import type { Service } from '../shared/lead'
import { Faq } from './components/Faq'
import { FinalCta } from './components/FinalCta'
import { FloatingWhatsApp } from './components/FloatingWhatsApp'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Highlights } from './components/Highlights'
import { HowItWorks } from './components/HowItWorks'
import { LeadSection } from './components/LeadSection'
import { PrivacyDialog } from './components/PrivacyDialog'
import { Services } from './components/Services'
import { Testimonials } from './components/Testimonials'

export default function App() {
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [preselect, setPreselect] = useState<{ service: Service; token: number } | null>(null)

  const openPrivacy = useCallback(() => setPrivacyOpen(true), [])
  const requestCall = useCallback((service: Service) => {
    setPreselect({ service, token: Date.now() })
    document.getElementById('cadastro')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className="min-h-screen">
      <Header />
      <main id="conteudo">
        <Hero />
        <Highlights />
        <Services onRequestCall={requestCall} />
        <HowItWorks />
        <Testimonials />
        <LeadSection preselect={preselect} onOpenPrivacy={openPrivacy} />
        <Faq />
        <FinalCta />
      </main>
      <Footer onOpenPrivacy={openPrivacy} />
      <FloatingWhatsApp />
      <PrivacyDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  )
}
