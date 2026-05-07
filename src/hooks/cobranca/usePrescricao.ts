import { useState, useEffect, useCallback } from 'react'
import { differenceInDays, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { StatusPrescricao } from '@/types/cobranca'

export interface AlertaPrescricao {
  caso_id: string
  titulo_id: string
  credor_nome: string
  devedor_nome: string
  valor_atualizado: number
  data_limite: string
  dias_restantes: number
  status: StatusPrescricao
  via_processual: string | null
}

export type FaixaAlerta = 'critico' | 'urgente' | 'atencao' | 'prescrito'

export function getFaixaAlerta(dias: number): FaixaAlerta {
  if (dias < 0)   return 'prescrito'
  if (dias <= 30) return 'critico'
  if (dias <= 60) return 'urgente'
  return 'atencao'  // 61–90
}

export function usePrescricao(limiteDias = 90) {
  const [alertas, setAlertas] = useState<AlertaPrescricao[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAlertas = useCallback(async () => {
    setLoading(true)
    setError(null)

    const hoje = new Date()
    const limiteData = new Date()
    limiteData.setDate(hoje.getDate() + limiteDias)

    try {
      const { data, error: err } = await supabase
        .from('titulos')
        .select(`
          id,
          data_limite_ajuizamento,
          valor_atualizado,
          status_prescricao,
          credores ( nome ),
          devedores ( nome ),
          casos ( id, via_processual, status )
        `)
        .lte('data_limite_ajuizamento', limiteData.toISOString().split('T')[0])
        .neq('status_prescricao', 'VERDE')
        .order('data_limite_ajuizamento', { ascending: true })

      if (err) throw err

      const lista: AlertaPrescricao[] = (data ?? [])
        .filter(t => {
          const casos = Array.isArray(t.casos) ? t.casos : [t.casos]
          return casos.some(c => c && c.status === 'ATIVO')
        })
        .map(t => {
          const dataLimite = parseISO(t.data_limite_ajuizamento)
          const diasRestantes = differenceInDays(dataLimite, hoje)
          const credor = Array.isArray(t.credores) ? t.credores[0] : t.credores
          const devedor = Array.isArray(t.devedores) ? t.devedores[0] : t.devedores
          const casos = Array.isArray(t.casos) ? t.casos : [t.casos]
          const casoAtivo = casos.find(c => c?.status === 'ATIVO')

          return {
            caso_id: casoAtivo?.id ?? '',
            titulo_id: t.id,
            credor_nome: credor?.nome ?? '—',
            devedor_nome: devedor?.nome ?? '—',
            valor_atualizado: t.valor_atualizado,
            data_limite: t.data_limite_ajuizamento,
            dias_restantes: diasRestantes,
            status: t.status_prescricao as StatusPrescricao,
            via_processual: casoAtivo?.via_processual ?? null,
          }
        })

      setAlertas(lista)
    } catch (err) {
      setError('Erro ao carregar alertas de prescrição.')
      console.error('[usePrescricao]', err)
    } finally {
      setLoading(false)
    }
  }, [limiteDias])

  useEffect(() => {
    void fetchAlertas()
  }, [fetchAlertas])

  const criticos  = alertas.filter(a => a.dias_restantes <= 30 && a.dias_restantes >= 0)
  const urgentes  = alertas.filter(a => a.dias_restantes > 30 && a.dias_restantes <= 60)
  const atencao   = alertas.filter(a => a.dias_restantes > 60 && a.dias_restantes <= 90)
  const prescritos = alertas.filter(a => a.dias_restantes < 0)

  return {
    alertas,
    criticos,
    urgentes,
    atencao,
    prescritos,
    total: alertas.length,
    loading,
    error,
    refetch: fetchAlertas,
  }
}
