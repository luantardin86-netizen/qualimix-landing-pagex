/**
 * Mapping from the internal lead record to the payload sent to the CRM.
 *
 * The CRM contract is NOT defined yet. This is the single place to adapt
 * field names/shape once the Qualimix CRM publishes its API specification.
 */
import type { LeadRecord } from '../leads/types'

export interface CrmLeadPayload {
  external_id: string
  nome: string
  sobrenome: string
  telefone: string
  empresa: string | null
  email: string | null
  servico: string
  mensagem: string
  origem: string
  pagina: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  consentimento: { aceito: boolean; versao_aviso: string; registrado_em: string }
  recebido_em: string
}

export function toCrmPayload(lead: LeadRecord): CrmLeadPayload {
  return {
    external_id: lead.id,
    nome: lead.nome,
    sobrenome: lead.sobrenome,
    telefone: lead.telefone,
    empresa: lead.empresa,
    email: lead.email,
    servico: lead.servico,
    mensagem: lead.mensagem,
    origem: lead.origem,
    pagina: lead.pagina,
    utm_source: lead.utm_source,
    utm_medium: lead.utm_medium,
    utm_campaign: lead.utm_campaign,
    utm_term: lead.utm_term,
    utm_content: lead.utm_content,
    consentimento: {
      aceito: lead.consentimento,
      versao_aviso: lead.consentimento_versao,
      registrado_em: new Date(lead.consentimento_em).toISOString(),
    },
    recebido_em: new Date(lead.received_at).toISOString(),
  }
}
