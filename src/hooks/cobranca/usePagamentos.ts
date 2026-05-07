/**
 * usePagamentos — Hook React para o módulo de pagamentos integrados.
 *
 * Gerencia cobranças financeiras de um caso: geração de Pix, emissão
 * de boleto, link unificado e consulta do histórico de pagamentos.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { gerarCobrancaPix, type PixCobrancaParams, type PixCobrancaResult } from '@/lib/pagamentos/pix'
import { emitirBoleto, type BoletoParams, type BoletoResult } from '@/lib/pagamentos/boleto'
import { gerarLinkPagamento, type LinkPagamentoParams, type LinkPagamentoResult } from '@/lib/pagamentos/linkPagamento'

// ── Tipos ─────────────────────────────────────────────────────

export interface CobrancaFinanceira {
  id:                    string
  caso_id:               string
  tipo_pagamento:        'pix' | 'pix_automatico' | 'boleto' | 'cartao' | 'link'
  valor_original:        number
  valor_total:           number
  data_vencimento:       string
  data_pagamento:        string | null
  status:                'pendente' | 'pago' | 'vencido' | 'cancelado' | 'estornado'
  pix_txid:              string | null
  pix_qrcode:            string | null
  pix_copia_cola:        string | null
  boleto_codigo:         string | null
  boleto_pdf_url:        string | null
  link_pagamento:        string | null
  link_visualizacoes:    number
  id_gateway:            string | null
  parcela_numero:        number
  total_parcelas:        number
  split_escritorio_pct:  number
  split_credor_pct:      number
  split_valor_escritorio: number
  split_valor_credor:    number
  created_at:            string
}

interface Totais {
  total_cobrado:   number
  total_recebido:  number
  total_pendente:  number
  total_vencido:   number
  total_escritorio: number
  total_credor:    number
}

interface UsePagamentosReturn {
  pagamentos:    CobrancaFinanceira[]
  totais:        Totais
  isLoading:     boolean
  erro:          string | null
  refetch:       () => void

  // Ações
  gerarPix:    (params: Omit<PixCobrancaParams, 'caso_id'>) => Promise<PixCobrancaResult>
  emitirBoleto:(params: Omit<BoletoParams,    'caso_id'>) => Promise<BoletoResult>
  gerarLink:   (params: Omit<LinkPagamentoParams, 'caso_id'>) => Promise<LinkPagamentoResult>

  // Estados de operação
  gerandoPix:    boolean
  emitindoBoleto: boolean
  gerandoLink:   boolean
}

// ── Hook ──────────────────────────────────────────────────────

export function usePagamentos(caso_id: string): UsePagamentosReturn {
  const [pagamentos,    setPagamentos]    = useState<CobrancaFinanceira[]>([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [erro,          setErro]          = useState<string | null>(null)
  const [gerandoPix,    setGerandoPix]    = useState(false)
  const [emitindoBoleto, setEmitindoBoleto] = useState(false)
  const [gerandoLink,   setGerandoLink]   = useState(false)

  const fetchPagamentos = useCallback(async () => {
    if (!caso_id) return
    setIsLoading(true)
    setErro(null)
    try {
      const { data, error } = await supabase
        .from('cobrancas_financeiras')
        .select('*')
        .eq('caso_id', caso_id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setPagamentos((data ?? []) as CobrancaFinanceira[])
    } catch (err) {
      setErro('Erro ao carregar pagamentos.')
      console.error('[usePagamentos]', err)
    } finally {
      setIsLoading(false)
    }
  }, [caso_id])

  useEffect(() => { void fetchPagamentos() }, [fetchPagamentos])

  // ── Totais calculados ────────────────────────────────────────
  const totais: Totais = pagamentos.reduce(
    (acc, p) => {
      acc.total_cobrado += p.valor_total
      if (p.status === 'pago') {
        acc.total_recebido   += p.valor_total
        acc.total_escritorio += p.split_valor_escritorio
        acc.total_credor     += p.split_valor_credor
      }
      if (p.status === 'pendente') acc.total_pendente += p.valor_total
      if (p.status === 'vencido')  acc.total_vencido  += p.valor_total
      return acc
    },
    {
      total_cobrado:    0,
      total_recebido:   0,
      total_pendente:   0,
      total_vencido:    0,
      total_escritorio: 0,
      total_credor:     0,
    } satisfies Totais,
  )

  // ── Ações ────────────────────────────────────────────────────

  const gerarPixAction = async (
    params: Omit<PixCobrancaParams, 'caso_id'>,
  ): Promise<PixCobrancaResult> => {
    setGerandoPix(true)
    try {
      const result = await gerarCobrancaPix({ ...params, caso_id })
      if (result.sucesso) void fetchPagamentos()
      return result
    } finally {
      setGerandoPix(false)
    }
  }

  const emitirBoletoAction = async (
    params: Omit<BoletoParams, 'caso_id'>,
  ): Promise<BoletoResult> => {
    setEmitindoBoleto(true)
    try {
      const result = await emitirBoleto({ ...params, caso_id })
      if (result.sucesso) void fetchPagamentos()
      return result
    } finally {
      setEmitindoBoleto(false)
    }
  }

  const gerarLinkAction = async (
    params: Omit<LinkPagamentoParams, 'caso_id'>,
  ): Promise<LinkPagamentoResult> => {
    setGerandoLink(true)
    try {
      const result = await gerarLinkPagamento({ ...params, caso_id })
      if (result.sucesso) void fetchPagamentos()
      return result
    } finally {
      setGerandoLink(false)
    }
  }

  return {
    pagamentos,
    totais,
    isLoading,
    erro,
    refetch: () => void fetchPagamentos(),
    gerarPix:     gerarPixAction,
    emitirBoleto: emitirBoletoAction,
    gerarLink:    gerarLinkAction,
    gerandoPix,
    emitindoBoleto,
    gerandoLink,
  }
}
