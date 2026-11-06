/**
 * Standalone Node.js entry point for the Qualimix leads API.
 * Run with `npm run dev:api` (watch) or `npm run start:api` (built bundle).
 */
import { serve } from '@hono/node-server'
import { loadConfig, loadDotEnv } from './config'
import { createContainer } from './container'
import { createPgPool } from './db/pool'
import { nodeClientIp } from './http/clientIp'
import { createLogger, describeError } from './logger'

loadDotEnv()
const config = loadConfig()
const logger = createLogger()

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  logger.error('startup.missing_database_url', { hint: 'Set DATABASE_URL (see .env.example)' })
  process.exit(1)
}
if (config.nodeEnv === 'production' && config.allowedOrigins.length === 0) {
  logger.warn('startup.no_allowed_origins', { hint: 'Only same-origin browser requests will be accepted' })
}
if (!config.ipHashSecret) {
  logger.warn('startup.no_ip_hash_secret', { hint: 'Per-IP persistent rate limiting disabled; set IP_HASH_SECRET' })
}

const pool = createPgPool(databaseUrl)
const { app, crmSync, crmClient } = createContainer({
  config,
  pool,
  logger,
  getClientIp: nodeClientIp(config.trustProxy),
  syncOnCreate: true,
})

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info('startup.listening', {
    port: info.port,
    crm: crmClient.isConfigured() ? 'configured' : 'not_configured (leads stay pending_sync)',
  })
})

let timer: NodeJS.Timeout | undefined
if (config.crm.syncIntervalMs > 0 && crmClient.isConfigured()) {
  timer = setInterval(() => {
    crmSync.runOnce().catch((error) => logger.error('crm.sync.worker_error', describeError(error)))
  }, config.crm.syncIntervalMs)
  timer.unref()
}

function shutdown(signal: string) {
  logger.info('shutdown', { signal })
  if (timer) clearInterval(timer)
  server.close(() => {
    void pool.end?.().finally(() => process.exit(0))
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
