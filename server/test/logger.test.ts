import { describe, expect, it } from 'vitest'
import { createLogger, describeError, redactPII } from '../src/logger'

describe('logger PII policy', () => {
  it('redacts e-mails and phone numbers in free text', () => {
    expect(redactPII('fail for joao@email.com tel +55 (61) 99112-4510')).toBe('fail for [email] tel [number]')
  })
  it('never includes pg error detail', () => {
    const err = Object.assign(new Error('duplicate key'), { code: '23505', detail: 'Key (telefone)=(+5561991124510)' })
    expect(JSON.stringify(describeError(err))).not.toContain('5561991124510')
  })
  it('writes JSON lines with redaction', () => {
    const lines: string[] = []
    createLogger('info', (l) => lines.push(l)).info('x', { note: 'a@b.com' })
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: 'info', event: 'x', note: '[email]' })
  })
})
