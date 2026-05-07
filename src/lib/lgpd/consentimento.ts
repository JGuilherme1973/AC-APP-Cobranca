/**
 * LGPD — Gestão de Consentimentos
 * Base legal principal: Art. 7º V (execução de contrato) e Art. 7º IX (legítimo interesse)
 */

import { supabase } from '@/lib/supabase'
import { registrarAuditoria } from './auditoria'

export interface ConsentimentoParams {
  devedor_id: string
  caso_id?: string
  canal: 'whatsapp' | 'email' | 'portal' | 'presencial' | 'carta' | 'sms'
  tipo: 'cobranca' | 'negativacao' | 'protesto' | 'compartilhamento_dados' | 'portal_negociacao'
  texto_apresentado: string
  concedido: boolean
  ip_address?: string
}

/**
 * Registra um consentimento LGPD. Nunca atualiza registros existentes —
 * cada consentimento é um registro imutável de auditoria.
 */
export async function registrarConsentimento(params: ConsentimentoParams): Promise<void> {
  const baseLegal =
    params.tipo === 'cobranca'
      ? 'Art. 7º IX — legítimo interesse'
      : 'Art. 7º V — execução de contrato'

  const { error } = await supabase.from('consentimentos_lgpd').insert({
    devedor_id: params.devedor_id,
    caso_id: params.caso_id ?? null,
    canal: params.canal,
    tipo_consentimento: params.tipo,
    base_legal: baseLegal,
    texto_apresentado: params.texto_apresentado,
    concedido: params.concedido,
    data_consentimento: new Date().toISOString(),
    ip_address: params.ip_address ?? null,
    revogado_em: null,
  })

  if (error) {
    throw new Error(`Erro ao registrar consentimento: ${error.message}`)
  }
}

/**
 * Verifica se o devedor possui consentimento ativo para determinado tipo.
 *
 * Para tipo='cobranca': sempre retorna true (base legal = legítimo interesse,
 * não requer consentimento explícito), mas ainda consulta e loga o registro.
 */
export async function verificarConsentimento(
  devedor_id: string,
  tipo: ConsentimentoParams['tipo']
): Promise<boolean> {
  const { data, error } = await supabase
    .from('consentimentos_lgpd')
    .select('concedido, revogado_em')
    .eq('devedor_id', devedor_id)
    .eq('tipo_consentimento', tipo)
    .order('data_consentimento', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[LGPD] Erro ao verificar consentimento:', error)
  }

  // Cobrança: base legal é legítimo interesse — consentimento não é obrigatório
  if (tipo === 'cobranca') {
    return true
  }

  if (!data) return false
  return data.concedido === true && data.revogado_em === null
}

/**
 * Revoga todos os consentimentos ativos de um devedor para determinado tipo.
 * Registra auditoria, tenta logar em comunicacoes e notifica o advogado por e-mail.
 */
export async function revogarConsentimento(
  devedor_id: string,
  tipo: ConsentimentoParams['tipo'],
  ip_address?: string,
  usuario_id?: string
): Promise<void> {
  const agora = new Date().toISOString()

  // 1. Buscar registros antes da revogação para auditoria
  const { data: antes, error: fetchError } = await supabase
    .from('consentimentos_lgpd')
    .select('*')
    .eq('devedor_id', devedor_id)
    .eq('tipo_consentimento', tipo)
    .is('revogado_em', null)

  if (fetchError) {
    throw new Error(`Erro ao buscar consentimentos: ${fetchError.message}`)
  }

  // 2. Marcar como revogado
  const { error: updateError } = await supabase
    .from('consentimentos_lgpd')
    .update({ revogado_em: agora })
    .eq('devedor_id', devedor_id)
    .eq('tipo_consentimento', tipo)
    .is('revogado_em', null)

  if (updateError) {
    throw new Error(`Erro ao revogar consentimento: ${updateError.message}`)
  }

  // 3. Registrar auditoria
  await registrarAuditoria({
    usuario_id,
    acao: 'CONSENTIMENTO_REVOGADO',
    entidade: 'consentimentos_lgpd',
    entidade_id: devedor_id,
    dados_antes: { registros: antes ?? [] },
    dados_depois: { tipo_consentimento: tipo, revogado_em: agora },
    ip_address,
  })

  // 4. Tentar logar em comunicacoes (falha silenciosa se tabela não existir)
  try {
    await supabase.from('comunicacoes').insert({
      devedor_id,
      tipo: 'lgpd_revogacao',
      canal: 'sistema',
      descricao: `Revogação de consentimento: ${tipo}`,
      data_envio: agora,
      ip_address: ip_address ?? null,
    })
  } catch {
    // tabela comunicacoes pode não existir — log silencioso
    console.warn('[LGPD] Tabela comunicacoes indisponível para log de revogação')
  }

  // 5. Buscar e-mail do advogado responsável para notificação
  let advogadoEmail = 'juridico@andradecintra.adv.br'
  try {
    const { data: devedor } = await supabase
      .from('devedores')
      .select('casos(responsavel:usuarios(email))')
      .eq('id', devedor_id)
      .maybeSingle()

    const emailDinamico = (devedor as Record<string, unknown> | null)
      ?.casos as { responsavel?: { email?: string } }[] | null
    if (emailDinamico?.[0]?.responsavel?.email) {
      advogadoEmail = emailDinamico[0].responsavel.email
    }
  } catch {
    // usa e-mail padrão
  }

  // 6. Notificar advogado por e-mail
  await supabase.functions.invoke('enviar-email', {
    body: {
      para: advogadoEmail,
      assunto: `[LGPD] Revogação de consentimento — ${tipo}`,
      corpo: `
        O titular (devedor_id: ${devedor_id}) revogou o consentimento do tipo "${tipo}".
        Data/hora: ${agora}
        IP: ${ip_address ?? 'não informado'}

        Esta ação exige análise do escritório conforme o Art. 18 da Lei 13.709/2018.
      `.trim(),
    },
  })
}
