/**
 * OPTIONAL Netlify scheduled job: delivers pending leads to the CRM every
 * 10 minutes. It does nothing while CRM_API_URL is not configured (leads stay
 * `pending_sync`). Outside Netlify, use `npm run crm:sync` from cron or the
 * in-process worker of the Node server instead.
 */
import type { Config } from '@netlify/functions'
import { getDatabase } from '@netlify/database'
import { loadConfig } from '../../server/src/config'
import { createContainer } from '../../server/src/container'
import type { DbPool } from '../../server/src/db/pool'
import { createLogger, describeError } from '../../server/src/logger'

export default async () => {
  const logger = createLogger()
  try {
    const config = loadConfig({ ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' })
    if (!config.crm.apiUrl) {
      logger.info('crm.sync.skipped', { reason: 'CRM_API_URL not configured' })
      return
    }
    const { crmSync } = createContainer({ config, pool: getDatabase().pool as unknown as DbPool, logger })
    const summary = await crmSync.drain(5)
    logger.info('crm.sync.scheduled_run', { ...summary })
  } catch (error) {
    logger.error('crm.sync.scheduled_error', describeError(error))
  }
}

export const config: Config = {
  schedule: '*/10 * * * *',
}
