/**
 * One-shot CRM sync (cron-friendly).
 *   npm run crm:sync                 -> deliver all due pending leads
 *   npm run crm:sync -- --requeue    -> move sync_failed leads back to pending first
 */
import { loadConfig, loadDotEnv } from '../src/config'
import { createContainer } from '../src/container'
import { createPgPool } from '../src/db/pool'
import { createLogger } from '../src/logger'

loadDotEnv()
const config = loadConfig()
const logger = createLogger()
if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL (see .env.example)')
  process.exit(1)
}
const pool = createPgPool(process.env.DATABASE_URL)
const { crmSync, crmClient, store } = createContainer({ config, pool, logger })
try {
  if (process.argv.includes('--requeue')) {
    const n = await store.requeueFailed()
    console.log(`requeued ${n} failed lead(s)`)
  }
  if (!crmClient.isConfigured()) {
    const stats = await store.countByStatus()
    console.log(`CRM_API_URL not configured: nothing sent. Leads pending_sync: ${stats.pending_sync}`)
  } else {
    const summary = await crmSync.drain()
    console.log(JSON.stringify(summary))
  }
} catch (error) {
  console.error('crm sync failed:', (error as Error).message)
  process.exitCode = 1
} finally {
  await pool.end?.()
}
