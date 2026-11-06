/**
 * Database access abstraction. Any pg-compatible pool works (node-postgres,
 * Neon serverless, Netlify Database). All queries MUST use positional
 * parameters ($1, $2...) — never string concatenation — to prevent SQL injection.
 */
import pg from 'pg'

export interface QueryResult<R> {
  rows: R[]
  rowCount: number | null
}

export interface DbClient {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<R>>
  release(): void
}

export interface DbPool {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<R>>
  connect(): Promise<DbClient>
  end?(): Promise<void>
}

export function createPgPool(connectionString: string, max = Number(process.env.DB_POOL_MAX) || 10): DbPool {
  const pool = new pg.Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
  })
  // Prevent idle-client errors from crashing the process; they are retried on next checkout.
  pool.on('error', () => {})
  return pool as unknown as DbPool
}

/** Runs `fn` inside a transaction, rolling back on error. */
export async function withTransaction<T>(pool: DbPool, fn: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Connection-level failures (database down, unreachable, auth, missing DB). */
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
  '28P01', // invalid_password
  '28000', // invalid_authorization_specification
  '3D000', // invalid_catalog_name (database does not exist)
  '42P01', // undefined_table (migrations not applied)
])

export class DatabaseUnavailableError extends Error {
  constructor(public readonly causeCode?: string) {
    super('Database unavailable')
    this.name = 'DatabaseUnavailableError'
  }
}

export function isDatabaseUnavailable(error: unknown): boolean {
  if (error instanceof DatabaseUnavailableError) return true
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && (UNAVAILABLE_CODES.has(code) || code.startsWith('08'))) return true
  const message = String((error as { message?: unknown }).message ?? '')
  return /connection terminated|timeout exceeded when trying to connect|connect ECONNREFUSED/i.test(message)
}
