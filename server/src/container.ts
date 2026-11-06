/**
 * Composition root: wires config, database, services and the HTTP app.
 * Shared by the Node server, CLI scripts and optional serverless adapters.
 */
import type { Context } from 'hono'
import type { AppConfig } from './config'
import { CrmLeadClient } from './crm/CrmLeadClient'
import { createCrmSyncService } from './crm/crmSyncService'
import type { DbPool } from './db/pool'
import { createApp } from './http/app'
import { createLeadService } from './leads/leadService'
import { PostgresLeadStore } from './leads/postgresLeadStore'
import type { Logger } from './logger'

export function createContainer(opts: {
  config: AppConfig
  pool: DbPool
  logger: Logger
  getClientIp?: (c: Context) => string | null
  /** Trigger a CRM sync right after a lead is stored (long-running servers only). */
  syncOnCreate?: boolean
}) {
  const { config, pool, logger } = opts
  const store = new PostgresLeadStore(pool)
  const crmClient = new CrmLeadClient({
    apiUrl: config.crm.apiUrl,
    apiToken: config.crm.apiToken,
    timeoutMs: config.crm.timeoutMs,
  })
  const crmSync = createCrmSyncService({
    outbox: store,
    client: crmClient,
    logger,
    options: { batchSize: config.crm.batchSize, maxAttempts: config.crm.maxAttempts },
  })
  const leadService = createLeadService({ repo: store, config, logger })
  const app = createApp({
    config,
    logger,
    leadService,
    leadRepo: store,
    outbox: store,
    crmSync,
    getClientIp: opts.getClientIp,
    onLeadCreated:
      opts.syncOnCreate && crmClient.isConfigured()
        ? () => {
            void crmSync.runOnce().catch(() => {})
          }
        : undefined,
  })
  return { app, store, crmClient, crmSync, leadService }
}
