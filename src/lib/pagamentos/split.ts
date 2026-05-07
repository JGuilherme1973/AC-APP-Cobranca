/**
 * split.ts — Cálculo e registro de split financeiro (honorários A&C / repasse credor).
 * Relatório mensal: base para o extrato do cliente credor.
 */

import { supabase } from '@/lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────

export interface SplitResult {
  valor_total:       number
  valor_escritorio:  number
  valor_credor:      number
  pct_escritorio:    number
  pct_credor:        number
}

export interface RelatorioPeriodo {
  total_recebido:          number
  total_escritorio:        number
  total_repassado_credor:  number
  lista_pagamentos: {
    id:              string
    tipo_pagamento:  string
    valor_total:     number
    valor_escritorio: number
    valor_credor:    number
    data_pagamento:  string | null
  }[]
}

// ── Funções ───────────────────────────────────────────────────

/**
 * Cálculo puro do split — sem efeitos colaterais.
 * Arredondamento a 2 casas decimais (half-up).
 */
export function calcularSplit(
  valor_total: number,
  pct_escritorio: number,
): SplitResult {
  if (pct_escritorio < 0 || pct_escritorio > 100) {
    throw new RangeError('pct_escritorio deve estar entre 0 e 100')
  }
  const pct_credor       = 100 - pct_escritorio
  const valor_escritorio = Math.round(valor_total * pct_escritorio) / 100
  const valor_credor     = Math.round(valor_total * pct_credor) / 100

  return { valor_total, valor_escritorio, valor_credor, pct_escritorio, pct_credor }
}

/**
 * Persiste os valores calculados em cobrancas_financeiras e lança
 * registro na tabela auditoria (obrigatório — Módulo D).
 */
export async function registrarSplit(
  cobranca_id: string,
  resultado: SplitResult,
): Promise<void> {
  // 1. Atualizar percentuais na cobrança (os valores são colunas GENERATED no DB)
  const { error: errUpd } = await supabase
    .from('cobrancas_financeiras')
    .update({
      split_escritorio_pct: resultado.pct_escritorio,
      split_credor_pct:     resultado.pct_credor,
    })
    .eq('id', cobranca_id)

  if (errUpd) throw errUpd

  // 2. Auditoria obrigatória
  const { data: me } = await supabase.auth.getUser()
  await supabase.from('auditoria').insert({
    usuario_id:   me.user?.id ?? null,
    acao:         'REGISTRAR_SPLIT',
    entidade:     'cobrancas_financeiras',
    entidade_id:  cobranca_id,
    dados_depois: resultado,
  })
}

/**
 * Relatório de split por caso no período — usado para o extrato mensal do credor.
 */
export async function gerarRelatorioSplit(
  caso_id: string,
  periodo: { inicio: Date; fim: Date },
): Promise<RelatorioPeriodo> {
  const { data, error } = await supabase
    .from('cobrancas_financeiras')
    .select(`
      id, tipo_pagamento, valor_total, split_valor_escritorio,
      split_valor_credor, data_pagamento
    `)
    .eq('caso_id', caso_id)
    .eq('status', 'pago')
    .gte('data_pagamento', periodo.inicio.toISOString())
    .lte('data_pagamento', periodo.fim.toISOString())
    .order('data_pagamento', { ascending: true })

  if (error) throw error

  const lista = (data ?? []) as {
    id: string
    tipo_pagamento: string
    valor_total: number
    split_valor_escritorio: number
    split_valor_credor: number
    data_pagamento: string | null
  }[]

  const total_recebido         = lista.reduce((s, r) => s + r.valor_total, 0)
  const total_escritorio       = lista.reduce((s, r) => s + r.split_valor_escritorio, 0)
  const total_repassado_credor = lista.reduce((s, r) => s + r.split_valor_credor, 0)

  return {
    total_recebido,
    total_escritorio,
    total_repassado_credor,
    lista_pagamentos: lista.map(r => ({
      id:               r.id,
      tipo_pagamento:   r.tipo_pagamento,
      valor_total:      r.valor_total,
      valor_escritorio: r.split_valor_escritorio,
      valor_credor:     r.split_valor_credor,
      data_pagamento:   r.data_pagamento,
    })),
  }
}
