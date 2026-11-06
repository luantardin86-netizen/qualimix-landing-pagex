/**
 * Privacy notice shown next to the lead form.
 *
 * IMPORTANT: this text is a technical starting point written from what the
 * form actually collects. It MUST be reviewed by Qualimix's legal/privacy
 * advisor (controller identification, DPO/encarregado contact, retention
 * period, legal basis) before production use. When you change it, bump
 * PRIVACY_NOTICE_VERSION in shared/lead.ts.
 */
import { PHONE_DISPLAY } from './site'

export const PRIVACY_SECTIONS = [
  {
    title: 'Quais dados coletamos',
    body: 'Nome, sobrenome, telefone, serviço de interesse e a descrição da sua necessidade. Empresa e e-mail são opcionais. Também registramos a data e o horário do envio, a versão deste aviso que você aceitou, a página e os parâmetros de campanha (UTM) pelos quais você chegou, quando existirem.',
  },
  {
    title: 'Para que usamos',
    body: 'Exclusivamente para entrar em contato com você sobre a solicitação enviada, entender sua obra e elaborar o orçamento. Seus dados são registrados no sistema de atendimento comercial (CRM) da Qualimix para esse acompanhamento.',
  },
  {
    title: 'Proteção contra abuso',
    body: 'Para evitar envios automatizados e abusivos, o servidor pode calcular um código irreversível (hash) a partir do endereço de rede da conexão. O endereço em si não é armazenado.',
  },
  {
    title: 'Compartilhamento',
    body: 'Não vendemos nem cedemos seus dados. Eles são acessados apenas pela equipe e pelos sistemas necessários ao atendimento.',
  },
  {
    title: 'Seus direitos',
    body: `Você pode solicitar a confirmação, o acesso, a correção ou a exclusão dos seus dados, bem como revogar este consentimento, pelo WhatsApp ${PHONE_DISPLAY}.`,
  },
] as const
