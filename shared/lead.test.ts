import { describe, expect, it } from 'vitest'
import { PRIVACY_NOTICE_VERSION, leadRequestSchema, toFieldErrors } from './lead'

const valid = {
  nome: '  João ',
  sobrenome: 'da  Silva',
  telefone: '(61) 99112-4510',
  empresa: '',
  email: ' JOAO@Email.com ',
  servico: 'Concreto usinado',
  mensagem: 'Preciso de 12 m³ para uma laje.',
  consentimento: true,
  consentimento_versao: PRIVACY_NOTICE_VERSION,
  utm_source: 'google',
}

describe('leadRequestSchema', () => {
  it('normalizes a valid payload', () => {
    const r = leadRequestSchema.parse(valid)
    expect(r.nome).toBe('João')
    expect(r.sobrenome).toBe('da Silva')
    expect(r.telefone).toBe('+5561991124510')
    expect(r.email).toBe('joao@email.com')
    expect(r.empresa).toBeUndefined()
    expect(r.utm_source).toBe('google')
  })

  it('reports all required fields when empty', () => {
    const r = leadRequestSchema.safeParse({})
    expect(r.success).toBe(false)
    const fields = toFieldErrors(r.error!)
    for (const f of ['nome', 'sobrenome', 'telefone', 'servico', 'mensagem', 'consentimento', 'consentimento_versao']) {
      expect(fields[f], f).toBeTruthy()
    }
  })

  it('rejects missing consent, invalid phone, invalid email and unknown service', () => {
    const r = leadRequestSchema.safeParse({ ...valid, consentimento: false, telefone: '123', email: 'x@', servico: 'Asfalto' })
    const fields = toFieldErrors(r.error!)
    expect(Object.keys(fields).sort()).toEqual(['consentimento', 'email', 'servico', 'telefone'])
  })

  it('rejects names with digits/markup and oversize messages', () => {
    const r = leadRequestSchema.safeParse({ ...valid, nome: '<script>', mensagem: 'x'.repeat(1501) })
    const fields = toFieldErrors(r.error!)
    expect(fields.nome).toBeTruthy()
    expect(fields.mensagem).toBeTruthy()
  })
})
