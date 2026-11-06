import { describe, expect, it } from 'vitest'
import { formatBrazilianPhone, normalizeBrazilianPhone, toNationalNumber } from './phone'

describe('normalizeBrazilianPhone', () => {
  it.each([
    ['61999999998', '+5561999999998'],
    ['(61) 99112-4510', '+5561991124510'],
    ['+55 61 99112-4510', '+5561991124510'],
    ['5561991124510', '+5561991124510'],
    ['061 99112-4510', '+5561991124510'],
    ['(11) 3333-4444', '+551133334444'],
  ])('%s -> %s', (input, expected) => expect(normalizeBrazilianPhone(input)).toBe(expected))

  it.each([
    ['', 'empty'],
    ['12345', 'too short'],
    ['(10) 99999-1234', 'invalid DDD'],
    ['(61) 89999-1234', 'mobile without 9'],
    ['(61) 1333-4444', 'landline starting with 1'],
    ['(61) 99999-9999', 'repeated digits'],
    ['619991245101234', 'too long'],
  ])('rejects %s (%s)', (input) => expect(normalizeBrazilianPhone(input)).toBeNull())

  it('toNationalNumber strips country code', () => expect(toNationalNumber('+55 (61) 99112-4510')).toBe('61991124510'))
})

describe('formatBrazilianPhone (input mask)', () => {
  it.each([
    ['6', '(6'],
    ['61', '(61'],
    ['619', '(61) 9'],
    ['6199112', '(61) 9911-2'],
    ['6133334444', '(61) 3333-4444'],
    ['61991124510', '(61) 99112-4510'],
    ['619911245109999', '(61) 99112-4510'],
    ['abc61-99112.4510', '(61) 99112-4510'],
  ])('%s -> %s', (input, expected) => expect(formatBrazilianPhone(input)).toBe(expected))
})
