import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Tarefa, PrioridadeTarefa } from '@/types/cobranca'

export interface TarefaComCaso extends Omit<Tarefa, 'responsavel'> {
  responsavel_nome: string
  caso_numero?: string
  devedor_nome?: string
}

export type GrupoTarefas = 'vencidas' | 'hoje' | 'proximos_7_dias'

function classificar(prazo: string): GrupoTarefas | null {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const amanha = new Date(hoje)
  amanha.setDate(amanha.getDate() + 1)
  const em7 = new Date(hoje)
  em7.setDate(em7.getDate() + 7)

  const data = new Date(prazo + 'T00:00:00')
  if (data < hoje)    return 'vencidas'
  if (data < amanha)  return 'hoje'
  if (data <= em7)    return 'proximos_7_dias'
  return null
}

export function usePrazos() {
  const [vencidas, setVencidas]           = useState<TarefaComCaso[]>([])
  const [hoje, setHoje]                   = useState<TarefaComCaso[]>([])
  const [proximos7, setProximos7]         = useState<TarefaComCaso[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)

  const fetchTarefas = useCallback(async () => {
    setLoading(true)
    setError(null)

    const hoje_data = new Date()
    hoje_data.setHours(0, 0, 0, 0)
    const em7 = new Date(hoje_data)
    em7.setDate(em7.getDate() + 7)

    try {
      const { data, error: err } = await supabase
        .from('tarefas')
        .select(`
          *,
          usuarios ( nome ),
          casos (
            numero_processo,
            titulos ( devedores ( nome ) )
          )
        `)
        .in('status', ['A_FAZER', 'EM_ANDAMENTO'])
        .lte('prazo', em7.toISOString().split('T')[0])
        .order('prazo', { ascending: true })
        .order('prioridade', { ascending: false })

      if (err) throw err

      const tarefas: TarefaComCaso[] = (data ?? []).map(t => {
        const usuario = Array.isArray(t.usuarios) ? t.usuarios[0] : t.usuarios
        const caso = Array.isArray(t.casos) ? t.casos[0] : t.casos
        const titulo = caso?.titulos ? (Array.isArray(caso.titulos) ? caso.titulos[0] : caso.titulos) : null
        const devedor = titulo?.devedores ? (Array.isArray(titulo.devedores) ? titulo.devedores[0] : titulo.devedores) : null

        return {
          id: t.id,
          caso_id: t.caso_id,
          descricao: t.descricao,
          responsavel_id: t.responsavel_id,
          responsavel_nome: usuario?.nome ?? '—',
          prazo: t.prazo,
          prioridade: t.prioridade as PrioridadeTarefa,
          status: t.status,
          created_at: t.created_at,
          caso_numero: caso?.numero_processo ?? undefined,
          devedor_nome: devedor?.nome ?? undefined,
        }
      })

      setVencidas(tarefas.filter(t => classificar(t.prazo) === 'vencidas'))
      setHoje(tarefas.filter(t => classificar(t.prazo) === 'hoje'))
      setProximos7(tarefas.filter(t => classificar(t.prazo) === 'proximos_7_dias'))
    } catch (err) {
      setError('Erro ao carregar tarefas.')
      console.error('[usePrazos]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTarefas()
  }, [fetchTarefas])

  return {
    vencidas,
    hoje,
    proximos7,
    total_urgentes: vencidas.length + hoje.length,
    loading,
    error,
    refetch: fetchTarefas,
  }
}
