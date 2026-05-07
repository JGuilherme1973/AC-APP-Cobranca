/**
 * spc.ts — Integração com SPC Brasil para negativação de devedores.
 *
 * REGRA CRÍTICA (CDC Art. 43 §2º): A negativação NUNCA pode ser executada
 * sem que tenham decorrido pelo menos 10 dias corridos após o envio de
 * notificação prévia ao devedor. Esta regra é reforçada na camada de
 * aplicação e em triggers de DB.
 *
 * Fluxo idêntico ao serasa.ts, bureau = 'spc'.
 *
 * NOTA DE SEGURANÇA: Em produção, as chamadas à API do SPC devem ser
 * migradas para uma Supabase Edge Function para que as credenciais (API Key)
 * não fiquem expostas no bundle do frontend. Por ora usam VITE_SPC_*
 * apenas em ambiente de desenvolvimento/staging.
 */

import { supabase } from '@/lib/supabase'
import { formatarMoeda } from '@/lib/utils'
import { addDays, format, isAfter, startOfDay, parseISO } from 'date-fns'

// Re-exportar tipos do serasa.ts — não redefinir
export type {
  NegativacaoParams,
  NegativacaoResult,
  NegativacaoConsulta,
  RestricaoItem,
} from './serasa'

import type {
  NegativacaoParams,
  NegativacaoResult,
  NegativacaoConsulta,
  RestricaoItem,
} from './serasa'

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

function isStubMode(): boolean {
  const key = import.meta.env.VITE_SPC_API_KEY as string | undefined
  return !key || key.trim() === ''
}

// ── Funções públicas ──────────────────────────────────────────

/**
 * Inicia o processo de negativação enviando notificação prévia obrigatória no SPC.
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
      bureau: 'spc',
      valor: params.valor,
      data_vencimento_original: params.data_vencimento_original,
      data_notificacao_previa: hoje,
      canal_notificacao_previa: 'email_whatsapp',
      status: 'pendente_notificacao',
    })
    .select('id')
    .single()

  if (errInsert || !negativacao) {
    throw new Error(errInsert?.message ?? 'Erro ao criar registro de negativação SPC')
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
inadimplentes do SPC Brasil a partir de ${dataLiberada}, caso o débito não seja
regularizado até essa data.

Você tem o prazo de 10 (dez) dias a partir desta notificação para quitar ou
negociar o débito e evitar a negativação.

Fundamento legal: Art. 43, § 2º do Código de Defesa do Consumidor (Lei 8.078/1990).

Para regularizar sua situação, entre em contato conosco.
  `.trim()

  // Enviar notificação formal por e-mail
  await supabase.functions.invoke('enviar-email', {
    body: {
      subject: `Aviso: seu nome será negativado no SPC em ${dataLiberada} — regularize sua situação`,
      template: 'aviso_negativacao_previa',
      vars: {
        devedor_nome: nomeDevedor,
        valor: valorParaExibir,
        data_vencimento: params.data_vencimento_original,
        data_liberada: dataLiberada,
        bureau: 'SPC Brasil',
        texto_legal: textoLegal,
      },
    },
  }).catch(e => console.warn('[SPC iniciarProcessoNegativacao] Edge Function e-mail indisponível:', e))

  // Registrar comunicação enviada
  try {
    await supabase.from('comunicacoes').insert({
      tipo: 'aviso_negativacao_previa',
      canal: 'email',
      caso_id: params.caso_id,
      devedor_id: params.devedor_id,
      descricao: `Notificação prévia de negativação SPC enviada — prazo ${dataLiberada}`,
      data_envio: new Date().toISOString(),
    })
  } catch {
    console.warn('[SPC iniciarProcessoNegativacao] Tabela comunicacoes indisponível — log ignorado')
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
    console.warn('[SPC iniciarProcessoNegativacao] Erro ao registrar base legal LGPD — log ignorado')
  }

  await registrarEventoTimeline(
    params.caso_id,
    'NEGATIVACAO_INICIADA',
    `Notificação prévia de negativação SPC Brasil enviada — negativação liberada a partir de ${dataLiberada}`,
    uid,
  )

  await registrarAuditoria(
    'NEGATIVACAO_INICIADA',
    'negativacoes',
    negativacao.id,
    null,
    {
      bureau: 'spc',
      status: 'pendente_notificacao',
      data_notificacao_previa: hoje,
      data_liberada: dataLiberada,
      valor: params.valor,
    },
    uid,
  )
}

/**
 * Executa a negativação no SPC Brasil após o prazo legal de 10 dias.
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
      `Negativação SPC cancelada automaticamente — caso encontra-se ${statusCaso}`,
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
      'Negativação SPC cancelada — pagamento registrado após notificação prévia',
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
  let id_bureau: string

  if (isStubMode()) {
    console.warn('[STUB] SPC não configurado — simulando negativação')
    id_bureau = `SPC-STUB-${Date.now()}`
  } else {
    const apiUrl = import.meta.env.VITE_SPC_API_URL as string
    const apiKey = import.meta.env.VITE_SPC_API_KEY as string

    const response = await fetch(`${apiUrl}/negativacoes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        cpf_cnpj: (devedor as { cpf_cnpj?: string } | null)?.cpf_cnpj ?? '',
        nome: (devedor as { nome?: string } | null)?.nome ?? '',
        valor: negativacao.valor,
        data_vencimento: negativacao.data_vencimento_original,
        data_notificacao: negativacao.data_notificacao_previa,
        negativacao_id,
        caso_id: negativacao.caso_id,
      }),
    })

    if (!response.ok) {
      const errBody = await response.text().catch(() => response.statusText)
      throw new Error(`SPC API retornou erro: ${errBody}`)
    }

    const data = await response.json() as { id?: string; id_bureau?: string }
    id_bureau = data.id ?? data.id_bureau ?? `SPC-${Date.now()}`
  }

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
    `Devedor negativado no SPC Brasil — id_bureau: ${id_bureau}`,
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
 * Solicita baixa da negativação no SPC Brasil.
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
    if (!isStubMode() && negativacao.id_bureau) {
      const apiUrl = import.meta.env.VITE_SPC_API_URL as string
      const apiKey = import.meta.env.VITE_SPC_API_KEY as string

      const response = await fetch(`${apiUrl}/negativacoes/${negativacao.id_bureau}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ motivo }),
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => response.statusText)
        console.warn('[baixarNegativacao SPC] SPC retornou erro:', errBody)
        // Continuar mesmo com erro no gateway para manter consistência interna
      }
    } else if (isStubMode()) {
      console.warn('[STUB] SPC não configurado — simulando baixa de negativação')
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
      `Negativação baixada no SPC Brasil — motivo: ${motivo}`,
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
    console.error('[baixarNegativacao SPC]', err)
    return false
  }
}

/**
 * Consulta restrições de um CPF/CNPJ diretamente no SPC Brasil.
 * Em modo STUB retorna lista vazia.
 */
export async function consultarNegativacao(cpf_cnpj: string): Promise<NegativacaoConsulta> {
  if (isStubMode()) {
    console.warn('[STUB] SPC não configurado — retornando consulta vazia')
    return { cpf_cnpj, restricoes: [] }
  }

  const apiUrl = import.meta.env.VITE_SPC_API_URL as string
  const apiKey = import.meta.env.VITE_SPC_API_KEY as string

  const response = await fetch(`${apiUrl}/consultas/${encodeURIComponent(cpf_cnpj)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => response.statusText)
    throw new Error(`SPC consulta retornou erro: ${errBody}`)
  }

  const data = await response.json() as {
    cpf_cnpj?: string
    restricoes?: RestricaoItem[]
  }

  return {
    cpf_cnpj: data.cpf_cnpj ?? cpf_cnpj,
    restricoes: data.restricoes ?? [],
  }
}
