/**
 * Client for the Qualimix leads API (`POST /api/leads`).
 *
 * VITE_API_BASE_URL is the PUBLIC base URL of the backend (e.g.
 * https://api.qualimix.com.br). It is not a secret. Leave it empty when the
 * API is served from the same origin as the site (`/api/...`).
 * Never put CRM credentials in VITE_* variables.
 */
import type { FieldErrors, LeadApiResponse, LeadRequestBody } from '../../shared/lead'

export const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export type SubmitOutcome =
  | { kind: 'success'; id: string; duplicate: boolean; message: string }
  | { kind: 'validation'; fields: FieldErrors; message: string }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'unavailable'; message: string }
  /** No API answered (e.g. frontend preview without a backend configured). */
  | { kind: 'not_configured' }
  | { kind: 'network' }
  | { kind: 'unexpected'; status: number }

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export async function submitLead(
  body: LeadRequestBody,
  idempotencyKey: string,
  { timeoutMs = 15_000, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<SubmitOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetchImpl(`${API_BASE_URL}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch {
    return { kind: 'network' }
  } finally {
    clearTimeout(timer)
  }

  const isJson = (response.headers.get('Content-Type') ?? '').includes('application/json')
  if (!isJson) {
    warnIfNotConfigured(response.status)
    return response.status >= 500 || response.status === 404 || response.status === 405
      ? { kind: 'not_configured' }
      : { kind: 'unexpected', status: response.status }
  }

  let data: LeadApiResponse
  try {
    data = (await response.json()) as LeadApiResponse
  } catch {
    return { kind: 'unexpected', status: response.status }
  }

  if (response.ok && data.ok && typeof data.id === 'string') {
    return { kind: 'success', id: data.id, duplicate: data.duplicate, message: data.message }
  }
  if (data.ok) return { kind: 'unexpected', status: response.status }
  switch (response.status) {
    case 422:
      return { kind: 'validation', fields: data.fields ?? {}, message: data.message }
    case 429:
      return { kind: 'rate_limited', message: data.message }
    case 503:
      return { kind: 'unavailable', message: data.message }
    case 400:
      return { kind: 'rejected', message: data.message }
    case 404:
      return { kind: 'not_configured' }
    default:
      return { kind: 'unexpected', status: response.status }
  }
}

function warnIfNotConfigured(status: number) {
  if (import.meta.env.DEV || !API_BASE_URL) {
    console.warn(
      `[Qualimix] A API de cadastros não respondeu em "${API_BASE_URL || '(mesma origem)'}/api/leads" (HTTP ${status}). ` +
        'Inicie o backend (npm run dev:api) ou defina VITE_API_BASE_URL com o endereço público do backend.',
    )
  }
}
