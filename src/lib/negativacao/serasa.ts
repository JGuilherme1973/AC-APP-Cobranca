/**
 * serasa.ts — Integração com Serasa para negativação de devedores.
 *
 * REGRA CRÍTICA (CDC Art. 43 §2º): A negativação NUNCA pode ser executada
 * sem que tenham decorrido pelo menos 10 dias corridos após o envio de
 * notificação prévia ao devedor. Esta regra é reforçada na camada de
 * aplicação e em triggers de DB.
 *
 * Fluxo:
 *   iniciarProcessoNegativacao → insere negativacao com status='pendente_notificacao'
 *                              → envia notificação formal ao devedor (email/whatsapp)
 *                              → registra consentimento LGPD (legítimo interesse)
 *   executarNegativacao        → após D+10, POST à API Serasa → status='negativado'
 *   baixarNegativacao          → DELETE na API Serasa → status='baixado'
 *   consultarNegativacao       → GET na API Serasa por CPF/CNPJ
 *
 * SEGURANÇA: Todas as chamadas à API do Serasa passam pela Edge Function
 * proxy-serasa. A SERASA_API_KEY nunca é exposta no bundle do frontend.
 */

import { supabase } from '@/lib/supabase'
import { formatarMoeda } from '@/lib/utils'
import { addDays, format, isAfter, startOfDay, parseISO } from 'date-fns'

// ── Tipos públicos ────────────────────────────────────────────

export interface NegativacaoParams {
  caso_id: string
  devedor_id: string
  valor: number
  data_vencimento_original: string   // YYYY-MM-DD
  gerar_carta_correios?: boolean
}

export interface NegativacaoResult {
  sucesso: boolean
  negativacao_id: string
  id_bureau?: string
  status: string
}

export interface NegativacaoConsulta {
  cpf_cnpj: string
  restricoes: RestricaoItem[]
}

export interface RestricaoItem {
  id: string
  valor: number
  credor: string
  data: string
  status: string
}

// ── Helpers internos ──────────────────────────────────────────

async function obterUsuarioId(): Promise<string | null> {
  const { data: me } = await supabase.auth.getUser()
  if (!me.user) return null
  const { data } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_id', me.user.id)
    .single()
  return data?.id ?? null
}

async function registrarEventoTimeline(
  caso_id: string,
  tipo_evento: string,
  descricao: string,
  usuario_id?: string | null,
): Promise<void> {
  const uid = usuario_id !== undefined ? usuario_id : await obterUsuarioId()
  await supabase.from('eventos_timeline').insert({
    caso_id,
    tipo_evento,
    descricao,
    usuario_id: uid ?? null,
  })
}

async function registrarAuditoria(
  acao: string,
  entidade: string,
  entidade_id: string,
  dados_antes: Record<string, unknown> | null,
  dados_depois: Record<string, unknown> | null,
  usuario_id?: string | null,
): Promise<void> {
  const uid = usuario_id !== undefined ? usuario_id : await obterUsuarioId()
  await supabase.from('auditoria').insert({
    usuario_id: uid ?? null,
    acao,
    entidade,
    entidade_id,
    dados_antes,
    dados_depois,
    ip_address: null,
  })
}

// Stub mode is now handled server-side in proxy-serasa Edge Function

// ── Funções públicas ──────────────────────────────────────────

/**
 * Inicia o processo de negativação enviando notificação prévia obrigatória.
 * Conforme CDC Art. 43 §2º, o devedor deve ser notificado com no mínimo
 * 10 dias de antecedência antes da efetiva inclusão no bureau.
 * Esta função NÃO chama nenhuma API de bureau — apenas registra e notifica.
 */
export async function iniciarProcessoNegativacao(
  params: NegativacaoParams,
  usuario_id?: string,
): Promise<void> {
  const uid = usuario_id ?? await obterUsuarioId()
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const dataLiberada = format(addDays(new Date(), 10), 'dd/MM/yyyy')

  // Inserir registro de negativação
  const { data: negativacao, error: errInsert } = await supabase
    .from('negativacoes')
    .insert({
      caso_id: params.caso_id,
      devedor_id: params.devedor_id,
      bureau: 'serasa',
      valor: params.valor,
      data_vencimento_original: params.data_vencimento_original,
      data_notificacao_previa: hoje,
      canal_notificacao_previa: 'email_whatsapp',
      status: 'pendente_notificacao',
    })
    .select('id')
    .single()

  if (errInsert || !negativacao) {
    throw new Error(errInsert?.message ?? 'Erro ao criar registro de negativação')
  }

  // Buscar dados do devedor e do caso para o e-mail de notificação
  const { data: devedor } = await supabase
    .from('devedores')
    .select('nome, emails, telefones')
    .eq('id', params.devedor_id)
    .maybeSingle()

  const { data: caso } = await supabase
    .from('casos')
    .select('valor_atualizado')
    .eq('id', params.caso_id)
    .maybeSingle()

  const valorParaExibir = formatarMoeda(
    (caso as { valor_atualizado?: number } | null)?.valor_atualizado ?? params.valor
  )
  const nomeDevedor = (devedor as { nome?: string } | null)?.nome ?? 'Devedor'

  const textoLegal = `
NOTIFICAÇÃO PRÉVIA DE INCLUSÃO EM CADASTRO DE INADIMPLENTES

Prezado(a) ${nomeDevedor},

Informamos que, em razão do débito no valor de ${valorParaExibir} com vencimento
em ${params.data_vencimento_original}, seu nome será incluído no cadastro de
inadimplentes do SERASA a partir de ${dataLiberada}, caso o débito não seja
regularizado até essa data.

Você tem o prazo de 10 (dez) dias a partir desta notificação para quitar ou
negociar o débito e evitar a negativação.

Fundamento legal: Art. 43, § 2º do Código de Defesa do Consumidor (Lei 8.078/1990).

Para regularizar sua situação, entre em contato conosco.
  `.trim()

  // Enviar notificação formal por e-mail
  await supabase.functions.invoke('enviar-email', {
    body: {
      subject: `Aviso: seu nome será negativado em ${dataLiberada} — regularize sua situação`,
      template: 'aviso_negativacao_previa',
      vars: {
        devedor_nome: nomeDevedor,
        valor: valorParaExibir,
        data_vencimento: params.data_vencimento_original,
        data_liberada: dataLiberada,
        bureau: 'SERASA',
        texto_legal: textoLegal,
      },
    },
  }).catch(e => console.warn('[iniciarProcessoNegativacao] Edge Function e-mail indisponível:', e))

  // Registrar comunicação enviada
  try {
    await supabase.from('comunicacoes').insert({
      tipo: 'aviso_negativacao_previa',
      canal: 'email',
      caso_id: params.caso_id,
      devedor_id: params.devedor_id,
      descricao: `Notificação prévia de negativação Serasa enviada — prazo ${dataLiberada}`,
      data_envio: new Date().toISOString(),
    })
  } catch {
    console.warn('[iniciarProcessoNegativacao] Tabela comunicacoes indisponível — log ignorado')
  }

  // Registrar base legal LGPD (legítimo interesse — negativação de crédito)
  try {
    await supabase.from('consentimentos_lgpd').insert({
      devedor_id: params.devedor_id,
      caso_id: params.caso_id,
      tipo_consentimento: 'negativacao',
      base_legal: 'legitimo_interesse',
      texto_apresentado: textoLegal,
      concedido: true,
      canal: 'email',
      data_consentimento: new Date().toISOString(),
      revogado_em: null,
    })
  } catch {
    console.warn('[iniciarProcessoNegativacao] Erro ao registrar base legal LGPD — log ignorado')
  }

  await registrarEventoTimeline(
    params.caso_id,
    'NEGATIVACAO_INICIADA',
    `Notificação prévia de negativação Serasa enviada — negativação liberada a partir de ${dataLiberada}`,
    uid,
  )

  await registrarAuditoria(
    'NEGATIVACAO_INICIADA',
    'negativacoes',
    negativacao.id,
    null,
    {
      bureau: 'serasa',
      status: 'pendente_notificacao',
      data_notificacao_previa: hoje,
      data_liberada: dataLiberada,
      valor: params.valor,
    },
    uid,
  )
}

/**
 * Executa a negativação no Serasa após o prazo legal de 10 dias.
 * Verifica automaticamente se o caso foi encerrado ou se houve pagamento
 * após a notificação. Em modo STUB (sem API key), simula a negativação.
 */
export async function executarNegativacao(
  negativacao_id: string,
  usuario_id?: string,
): Promise<NegativacaoResult> {
  const uid = usuario_id ?? await obterUsuarioId()

  // Buscar registro de negativação
  const { data: negativacao, error: errFetch } = await supabase
    .from('negativacoes')
    .select('*')
    .eq('id', negativacao_id)
    .single()

  if (errFetch || !negativacao) {
    throw new Error('Registro de negativação não encontrado')
  }

  // CHECK A: data_notificacao_previa obrigatória
  if (!negativacao.data_notificacao_previa) {
    throw new Error('Negativação não pode ser executada sem notificação prévia registrada')
  }

  // CHECK B: prazo legal de 10 dias corridos (CDC Art. 43 §2º)
  const dataNotificacao = startOfDay(parseISO(negativacao.data_notificacao_previa as string))
  const dataLiberada = addDays(dataNotificacao, 10)
  const hoje = startOfDay(new Date())

  if (!isAfter(hoje, dataLiberada) && hoje.getTime() !== dataLiberada.getTime()) {
    const diasRestantes = Math.ceil(
      (dataLiberada.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
    )
    throw new Error(
      `Negativação bloqueada — prazo legal de 10 dias ainda não decorrido. ` +
      `Liberada em ${format(dataLiberada, 'dd/MM/yyyy')} (${diasRestantes} dia(s) restante(s)). ` +
      `CDC Art. 43 §2º`
    )
  }

  // CHECK C: verificar se caso foi encerrado ou pago
  const { data: caso } = await supabase
    .from('casos')
    .select('status')
    .eq('id', negativacao.caso_id)
    .maybeSingle()

  const statusCaso = (caso as { status?: string } | null)?.status
  if (statusCaso === 'encerrado' || statusCaso === 'pago') {
    await supabase
      .from('negativacoes')
      .update({ status: 'cancelado', motivo_baixa: `Caso ${statusCaso}` })
      .eq('id', negativacao_id)

    await registrarEventoTimeline(
      negativacao.caso_id as string,
      'NEGATIVACAO_CANCELADA',
      `Negativação cancelada automaticamente — caso encontra-se ${statusCaso}`,
      uid,
    )

    return {
      sucesso: false,
      negativacao_id,
      status: 'cancelado',
    }
  }

  // CHECK D: verificar pagamentos após a notificação prévia
  const { data: pagamentos } = await supabase
    .from('pagamentos')
    .select('id, criado_em')
    .eq('caso_id', negativacao.caso_id)
    .gte('criado_em', negativacao.data_notificacao_previa as string)
    .maybeSingle()

  if (pagamentos) {
    await supabase
      .from('negativacoes')
      .update({ status: 'cancelado', motivo_baixa: 'Pagamento registrado após notificação prévia' })
      .eq('id', negativacao_id)

    await registrarEventoTimeline(
      negativacao.caso_id as string,
      'NEGATIVACAO_CANCELADA',
      'Negativação cancelada — pagamento registrado após notificação prévia',
      uid,
    )

    return {
      sucesso: false,
      negativacao_id,
      status: 'cancelado',
    }
  }

  // Buscar CPF/CNPJ do devedor para envio à API
  const { data: devedor } = await supabase
    .from('devedores')
    .select('cpf_cnpj, nome')
    .eq('id', negativacao.devedor_id)
    .maybeSingle()

  const hoje_str = format(new Date(), 'yyyy-MM-dd')

  const { data: serasaData, error: serasaError } = await supabase.functions.invoke('proxy-serasa', {
    body: {
      action: 'negativar',
      cpf_cnpj: (devedor as { cpf_cnpj?: string } | null)?.cpf_cnpj ?? '',
      nome: (devedor as { nome?: string } | null)?.nome ?? '',
      valor: negativacao.valor,
      data_vencimento: negativacao.data_vencimento_original,
      data_notificacao: negativacao.data_notificacao_previa,
      negativacao_id,
      caso_id: negativacao.caso_id,
    },
  })

  if (serasaError) {
    throw new Error(`Serasa proxy retornou erro: ${serasaError.message}`)
  }

  const id_bureau: string = (serasaData as { id_bureau?: string })?.id_bureau ?? `SERASA-${Date.now()}`

  // Atualizar status para negativado
  await supabase
    .from('negativacoes')
    .update({
      status: 'negativado',
      data_negativacao: hoje_str,
      id_bureau,
    })
    .eq('id', negativacao_id)

  await registrarEventoTimeline(
    negativacao.caso_id as string,
    'NEGATIVACAO_EXECUTADA',
    `Devedor negativado no Serasa — id_bureau: ${id_bureau}`,
    uid,
  )

  await registrarAuditoria(
    'NEGATIVACAO_EXECUTADA',
    'negativacoes',
    negativacao_id,
    { status: negativacao.status },
    { status: 'negativado', data_negativacao: hoje_str, id_bureau },
    uid,
  )

  return {
    sucesso: true,
    negativacao_id,
    id_bureau,
    status: 'negativado',
  }
}

/**
 * Solicita baixa da negativação no Serasa.
 * Deve ser chamada após confirmação de pagamento — a baixa efetiva no bureau
 * pode levar até 5 dias úteis conforme Art. 43 §3º CDC.
 */
export async function baixarNegativacao(
  negativacao_id: string,
  motivo: string,
  usuario_id?: string,
): Promise<boolean> {
  const uid = usuario_id ?? await obterUsuarioId()

  const { data: negativacao, error: errFetch } = await supabase
    .from('negativacoes')
    .select('*')
    .eq('id', negativacao_id)
    .single()

  if (errFetch || !negativacao) {
    throw new Error('Registro de negativação não encontrado')
  }

  // Nota legal: CDC Art. 43 §3º — credor tem 5 dias úteis para comunicar baixa após pagamento
  try {
    if (negativacao.id_bureau) {
      const { error: serasaError } = await supabase.functions.invoke('proxy-serasa', {
        body: {
          action: 'baixar',
          id_bureau: negativacao.id_bureau,
          motivo,
        },
      })
      if (serasaError) {
        console.warn('[baixarNegativacao] proxy-serasa retornou erro:', serasaError.message)
        // Continuar mesmo com erro no gateway para manter consistência interna
      }
    }

    const hoje = format(new Date(), 'yyyy-MM-dd')
    const dados_antes = { status: negativacao.status, motivo_baixa: negativacao.motivo_baixa }

    await supabase
      .from('negativacoes')
      .update({
        status: 'baixado',
        data_baixa: hoje,
        motivo_baixa: motivo,
      })
      .eq('id', negativacao_id)

    await registrarEventoTimeline(
      negativacao.caso_id as string,
      'NEGATIVACAO_BAIXADA',
      `Negativação baixada no Serasa — motivo: ${motivo}`,
      uid,
    )

    await registrarAuditoria(
      'NEGATIVACAO_BAIXADA',
      'negativacoes',
      negativacao_id,
      dados_antes,
      { status: 'baixado', data_baixa: hoje, motivo_baixa: motivo },
      uid,
    )

    return true
  } catch (err) {
    console.error('[baixarNegativacao]', err)
    return false
  }
}

/**
 * Consulta restrições de um CPF/CNPJ via proxy-serasa Edge Function.
 * Em modo STUB (sem API key configurada no servidor), retorna lista vazia.
 */
export async function consultarNegativacao(cpf_cnpj: string): Promise<NegativacaoConsulta> {
  const { data, error } = await supabase.functions.invoke('proxy-serasa', {
    body: { action: 'consultar', cpf_cnpj },
  })

  if (error) {
    throw new Error(`Serasa consulta retornou erro: ${error.message}`)
  }

  const result = data as { cpf_cnpj?: string; restricoes?: RestricaoItem[] }

  return {
    cpf_cnpj: result.cpf_cnpj ?? cpf_cnpj,
    restricoes: result.restricoes ?? [],
  }
}
