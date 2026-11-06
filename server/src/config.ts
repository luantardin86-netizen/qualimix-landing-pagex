/**
 * Server configuration, read exclusively from environment variables.
 * Nothing here is ever sent to the browser.
 */

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test'
  port: number
  /** Explicitly allowed browser origins for CORS (exact match). */
  allowedOrigins: string[]
  /** Trust `X-Forwarded-For` (only enable behind a reverse proxy you control). */
  trustProxy: boolean
  /** Secret used to HMAC client IPs before storing them. Empty = IPs are not stored. */
  ipHashSecret: string
  /** Bearer token for the /api/admin/* routes. Empty = admin routes are disabled. */
  adminApiToken: string
  maxBodyBytes: number
  rateLimit: {
    windowMs: number
    maxPerWindow: number
    maxLeadsPerPhonePerDay: number
    maxLeadsPerIpPerHour: number
  }
  /** Submissions completed faster than this are treated as automated. */
  minFillTimeMs: number
  /** Identical submissions within this window are treated as duplicates. */
  duplicateWindowSeconds: number
  crm: {
    apiUrl: string
    apiToken: string
    timeoutMs: number
    maxAttempts: number
    batchSize: number
    /** Interval of the in-process sync worker (Node server only). 0 = disabled. */
    syncIntervalMs: number
  }
}

type Env = Record<string, string | undefined>

/** Used only outside production when ALLOWED_ORIGINS is empty (Vite / Lovable dev servers). */
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:8080', 'http://127.0.0.1:8080']

function int(env: Env, key: string, fallback: number, min = 0): number {
  const raw = env[key]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Invalid value for ${key}: expected an integer >= ${min}`)
  }
  return value
}

function bool(env: Env, key: string, fallback: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase()
  if (!raw) return fallback
  return raw === 'true' || raw === '1' || raw === 'yes'
}

function list(env: Env, key: string): string[] {
  return (env[key] ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

export function loadConfig(env: Env = process.env): AppConfig {
  const nodeEnvRaw = env.NODE_ENV ?? 'development'
  const nodeEnv: AppConfig['nodeEnv'] =
    nodeEnvRaw === 'production' || nodeEnvRaw === 'test' ? nodeEnvRaw : 'development'

  const crmApiUrl = (env.CRM_API_URL ?? '').trim()
  if (crmApiUrl) {
    let parsed: URL
    try {
      parsed = new URL(crmApiUrl)
    } catch {
      throw new Error('Invalid CRM_API_URL: not a valid URL')
    }
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
    if (parsed.protocol !== 'https:' && !(isLocal && nodeEnv !== 'production')) {
      throw new Error('Invalid CRM_API_URL: HTTPS is required (HTTP only allowed for localhost outside production)')
    }
  }

  return {
    nodeEnv,
    port: int(env, 'PORT', 3001, 1),
    allowedOrigins:
      list(env, 'ALLOWED_ORIGINS').length > 0 || nodeEnv === 'production'
        ? list(env, 'ALLOWED_ORIGINS')
        : DEV_ORIGINS,
    trustProxy: bool(env, 'TRUST_PROXY', false),
    ipHashSecret: env.IP_HASH_SECRET ?? '',
    adminApiToken: env.ADMIN_API_TOKEN ?? '',
    maxBodyBytes: int(env, 'MAX_BODY_BYTES', 16 * 1024, 1024),
    rateLimit: {
      windowMs: int(env, 'RATE_LIMIT_WINDOW_MS', 10 * 60 * 1000, 1000),
      maxPerWindow: int(env, 'RATE_LIMIT_MAX', 10, 1),
      maxLeadsPerPhonePerDay: int(env, 'RATE_LIMIT_PHONE_PER_DAY', 5, 1),
      maxLeadsPerIpPerHour: int(env, 'RATE_LIMIT_IP_PER_HOUR', 20, 1),
    },
    minFillTimeMs: int(env, 'MIN_FILL_TIME_MS', 2500),
    duplicateWindowSeconds: int(env, 'DUPLICATE_WINDOW_SECONDS', 600),
    crm: {
      apiUrl: crmApiUrl,
      apiToken: env.CRM_API_TOKEN ?? '',
      timeoutMs: int(env, 'CRM_TIMEOUT_MS', 10_000, 100),
      maxAttempts: int(env, 'CRM_MAX_ATTEMPTS', 8, 1),
      batchSize: int(env, 'CRM_SYNC_BATCH_SIZE', 20, 1),
      syncIntervalMs: int(env, 'CRM_SYNC_INTERVAL_MS', 60_000),
    },
  }
}

/** Loads `.env` into process.env when present (Node entry points only). */
export function loadDotEnv(path = '.env'): void {
  try {
    process.loadEnvFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
