import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { EtapaCaso, StatusCaso } from '@/types/cobranca'

export interface MetricasCasos {
  total_ativos: number
  valor_total_cobranca: number
  valor_recuperado_mes: number
  valor_recuperado_total: number
  total_extrajudicial_encerrados: number
  total_extrajudicial_exito: number
  total_judicial_encerrados: number
  total_judicial_exito: number
  taxa_sucesso_extrajudicial: number
  taxa_sucesso_judicial: number
  casos_por_etapa: Record<EtapaCaso, number>
}

const ETAPAS: EtapaCaso[] = [
  'DIAGNOSTICO',
  'ESTRATEGIA',
  'COBRANCA_EXTRAJUDICIAL',
  'ACAO_JUDICIAL',
  'EXECUCAO_RECUPERACAO',
]

const DEFAULT_METRICAS: MetricasCasos = {
  total_ativos: 0,
  valor_total_cobranca: 0,
  valor_recuperado_mes: 0,
  valor_recuperado_total: 0,
  total_extrajudicial_encerrados: 0,
  total_extrajudicial_exito: 0,
  total_judicial_encerrados: 0,
  total_judicial_exito: 0,
  taxa_sucesso_extrajudicial: 0,
  taxa_sucesso_judicial: 0,
  casos_por_etapa: {
    DIAGNOSTICO: 0,
    ESTRATEGIA: 0,
    COBRANCA_EXTRAJUDICIAL: 0,
    ACAO_JUDICIAL: 0,
    EXECUCAO_RECUPERACAO: 0,
  },
}

export function useCasos() {
  const [metricas, setMetricas] = useState<MetricasCasos>(DEFAULT_METRICAS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMetricas = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Casos ativos com valor do título
      const { data: casosAtivos, error: errAtivos } = await supabase
        .from('casos')
        .select(`
          id, etapa_atual, status, via_processual,
          titulos ( valor_atualizado )
        `)
        .eq('status', 'ATIVO' as StatusCaso)

      if (errAtivos) throw errAtivos

      // Pagamentos do mês atual
      const inicioMes = new Date()
      inicioMes.setDate(1)
      inicioMes.setHours(0, 0, 0, 0)

      const { data: pagamentosMes, error: errPag } = await supabase
        .from('pagamentos')
        .select('valor')
        .eq('tipo', 'PAGAMENTO_DEVEDOR')
        .gte('data_pagamento', inicioMes.toISOString().split('T')[0])

      if (errPag) throw errPag

      // Pagamentos totais recuperados
      const { data: pagamentosTotal, error: errPagTotal } = await supabase
        .from('pagamentos')
        .select('valor')
        .eq('tipo', 'PAGAMENTO_DEVEDOR')

      if (errPagTotal) throw errPagTotal

      // Casos encerrados para calcular taxa de sucesso
      const { data: casosEncerrados, error: errEnc } = await supabase
        .from('casos')
        .select('status, via_processual')
        .in('status', ['ENCERRADO_EXITO', 'ENCERRADO_SEM_EXITO'] as StatusCaso[])

      if (errEnc) throw errEnc

      // Calcular métricas
      const valorTotal = (casosAtivos ?? []).reduce((acc, c) => {
        const titulo = Array.isArray(c.titulos) ? c.titulos[0] : c.titulos
        return acc + (titulo?.valor_atualizado ?? 0)
      }, 0)

      const valorMes = (pagamentosMes ?? []).reduce((acc, p) => acc + p.valor, 0)
      const valorTotalRec = (pagamentosTotal ?? []).reduce((acc, p) => acc + p.valor, 0)

      // Pipeline por etapa
      const porEtapa = ETAPAS.reduce(
        (acc, e) => ({ ...acc, [e]: 0 }),
        {} as Record<EtapaCaso, number>,
      )
      ;(casosAtivos ?? []).forEach(c => {
        if (c.etapa_atual in porEtapa) porEtapa[c.etapa_atual as EtapaCaso]++
      })

      // Taxa de sucesso
      const encArr = casosEncerrados ?? []
      const vias_extrajudiciais = ['NEGOCIACAO_EXTRAJUDICIAL']
      const vias_judiciais = [
        'ACAO_COBRANCA', 'ACAO_MONITORIA', 'EXECUCAO_TITULO_EXTRAJUDICIAL',
        'CUMPRIMENTO_SENTENCA', 'JEC',
      ]

      const extEnc  = encArr.filter(c => vias_extrajudiciais.includes(c.via_processual ?? '')).length
      const extExito = encArr.filter(c =>
        vias_extrajudiciais.includes(c.via_processual ?? '') && c.status === 'ENCERRADO_EXITO',
      ).length

      const judEnc   = encArr.filter(c => vias_judiciais.includes(c.via_processual ?? '')).length
      const judExito = encArr.filter(c =>
        vias_judiciais.includes(c.via_processual ?? '') && c.status === 'ENCERRADO_EXITO',
      ).length

      setMetricas({
        total_ativos: casosAtivos?.length ?? 0,
        valor_total_cobranca: valorTotal,
        valor_recuperado_mes: valorMes,
        valor_recuperado_total: valorTotalRec,
        total_extrajudicial_encerrados: extEnc,
        total_extrajudicial_exito: extExito,
        total_judicial_encerrados: judEnc,
        total_judicial_exito: judExito,
        taxa_sucesso_extrajudicial: extEnc > 0 ? Math.round((extExito / extEnc) * 100) : 0,
        taxa_sucesso_judicial: judEnc > 0 ? Math.round((judExito / judEnc) * 100) : 0,
        casos_por_etapa: porEtapa,
      })
    } catch (err) {
      setError('Erro ao carregar métricas. Verifique a conexão com o banco.')
      console.error('[useCasos]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMetricas()
  }, [fetchMetricas])

  return { metricas, loading, error, refetch: fetchMetricas }
}
