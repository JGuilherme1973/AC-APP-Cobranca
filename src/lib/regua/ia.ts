/**
 * ia.ts — Wrapper client-side para a Edge Function ia-regua (GPT-4o).
 *
 * Todas as chamadas à OpenAI acontecem server-side (Edge Function) —
 * a chave OPENAI_API_KEY jamais é exposta no bundle do frontend.
 */

import { supabase } from '@/lib/supabase'

// ── Tipos públicos ────────────────────────────────────────────

export interface IAPersonalizacaoParams {
  template_base: string
  devedor: {
    nome:                 string
    valor_devido:         number
    dias_atraso:          number
    historico_respostas:  string[]
    perfil_risco:         string
  }
  tom:   'amigavel' | 'formal' | 'negociacao' | 'juridico'
  canal: 'whatsapp' | 'email'
}

export type IntencaoDevedor =
  | 'vai_pagar'
  | 'quer_negociar'
  | 'contestando_divida'
  | 'solicitando_prazo'
  | 'sem_condicao_pagar'
  | 'ignorando'
  | 'outro'

export interface SugestaoAcao {
  acao:          string
  justificativa: string
  urgencia:      'baixa' | 'media' | 'alta' | 'critica'
}

export interface CasoContext {
  devedor_nome:       string
  valor_atualizado:   number
  dias_atraso:        number
  etapa_atual:        string
  perfil_risco:       string
  ultimo_contato?:    string
  intencao_detectada?: IntencaoDevedor
}

// ── Funções públicas ──────────────────────────────────────────

/**
 * Personaliza uma mensagem de cobrança via GPT-4o.
 * A IA adapta tom e conteúdo ao perfil do devedor,
 * respeitando o CDC e a ética profissional.
 */
export async function personalizarMensagem(
  params: IAPersonalizacaoParams,
): Promise<{ mensagem: string; tokens_usados: number }> {
  const { data, error } = await supabase.functions.invoke('ia-regua', {
    body: { action: 'personalizar_mensagem', ...params },
  })

  if (error) {
    console.warn('[ia] Personalização falhou, usando template base:', error.message)
    return { mensagem: params.template_base, tokens_usados: 0 }
  }

  return {
    mensagem:      (data as Record<string, unknown>).mensagem as string ?? params.template_base,
    tokens_usados: (data as Record<string, unknown>).tokens_usados as number ?? 0,
  }
}

/**
 * Classifica a intenção do devedor em uma resposta recebida.
 * Usado para atualizar o campo ia_tom_detectado em execucoes_regua.
 */
export async function classificarIntencaoDevedor(
  resposta: string,
): Promise<IntencaoDevedor> {
  const { data, error } = await supabase.functions.invoke('ia-regua', {
    body: { action: 'classificar_intencao', resposta },
  })

  if (error) return 'outro'

  return ((data as Record<string, unknown>).intencao as IntencaoDevedor) ?? 'outro'
}

/**
 * Solicita sugestão da próxima ação ao GPT-4o baseada no contexto do caso.
 * A sugestão é exibida ao advogado — nunca executada automaticamente.
 */
export async function sugerirProximaAcao(
  caso: CasoContext,
): Promise<SugestaoAcao | null> {
  const contexto =
    `Caso de cobrança:\n` +
    `Devedor: ${caso.devedor_nome}\n` +
    `Valor: R$ ${caso.valor_atualizado.toFixed(2)}\n` +
    `Dias de atraso: ${caso.dias_atraso}\n` +
    `Etapa: ${caso.etapa_atual}\n` +
    `Perfil de risco: ${caso.perfil_risco}\n` +
    (caso.ultimo_contato ? `Último contato: ${caso.ultimo_contato}\n` : '') +
    (caso.intencao_detectada ? `Intenção detectada: ${caso.intencao_detectada}\n` : '')

  const { data, error } = await supabase.functions.invoke('ia-regua', {
    body: { action: 'sugerir_proxima_acao', contexto },
  })

  if (error) return null

  return ((data as Record<string, unknown>).sugestao as SugestaoAcao) ?? null
}
