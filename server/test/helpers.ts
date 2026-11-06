import { PRIVACY_NOTICE_VERSION } from '../../shared/lead'
import { loadConfig, type AppConfig } from '../src/config'

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    ALLOWED_ORIGINS: 'https://qualimix.example',
    IP_HASH_SECRET: 'test-secret',
    ADMIN_API_TOKEN: 'admin-test-token',
    MIN_FILL_TIME_MS: '2000',
    ...overrides,
  })
}

let n = 0
/** Unique valid payload (different content each call). */
export function validPayload(extra: Record<string, unknown> = {}) {
  n++
  return {
    nome: 'João',
    sobrenome: 'Silva',
    telefone: '61991124510',
    empresa: 'Construtora Exemplo',
    email: 'joao@email.com',
    servico: 'Concreto usinado',
    mensagem: `Solicito orçamento para laje de ${n}0 m².`,
    consentimento: true,
    consentimento_versao: PRIVACY_NOTICE_VERSION,
    origem: 'Landing Page',
    pagina: '/',
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'qualimix',
    website: '',
    tempo_preenchimento_ms: 15000,
    ...extra,
  }
}
