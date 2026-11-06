/**
 * Brazilian phone helpers shared by the frontend (mask) and the backend
 * (normalization). Pure functions, no dependencies.
 */

/** Valid Brazilian area codes (DDD) as defined by Anatel. */
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45,
  46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83,
  84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
])

export function onlyDigits(value: string): string {
  return value.replace(/\D+/g, '')
}

/**
 * Strips the optional country code (55) and trunk prefix (0) and returns the
 * national number (DDD + subscriber number, 10 or 11 digits) or `null` when
 * the input is not a plausible Brazilian landline or mobile number.
 */
export function toNationalNumber(input: string): string | null {
  let digits = onlyDigits(input)
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2)
  if (digits.length !== 10 && digits.length !== 11) return null

  const ddd = Number(digits.slice(0, 2))
  if (!VALID_DDDS.has(ddd)) return null

  const subscriber = digits.slice(2)
  if (subscriber.length === 9) {
    // Mobile numbers have 9 digits and always start with 9.
    if (subscriber[0] !== '9') return null
  } else {
    // Landlines have 8 digits and start with 2-5.
    if (!/^[2-5]/.test(subscriber)) return null
  }
  // Reject obviously fake sequences such as 99999-9999 or 00000000.
  if (/^(\d)\1+$/.test(subscriber.slice(1))) return null
  return digits
}

/** Normalizes to E.164 (e.g. `+5561999999999`) or returns `null` if invalid. */
export function normalizeBrazilianPhone(input: string): string | null {
  const national = toNationalNumber(input)
  return national ? `+55${national}` : null
}

/** Progressive input mask: `(61) 99999-9999` or `(61) 3333-4444`. */
export function formatBrazilianPhone(input: string): string {
  let digits = onlyDigits(input)
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2)
  digits = digits.slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`
  const ddd = digits.slice(0, 2)
  const rest = digits.slice(2)
  if (rest.length <= 4) return `(${ddd}) ${rest}`
  if (digits.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
}
