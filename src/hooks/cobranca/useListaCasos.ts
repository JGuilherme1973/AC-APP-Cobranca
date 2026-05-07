import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface CasoLista {
  id: string
  etapa_atual: string
  status: string
  data_abertura: string
  numero_processo: string | null
  valor_atualizado: number
  data_limite_ajuizamento: string
  status_prescricao: string
  credor_nome: string
  credor_tipo: string
  devedor_nome: string
  devedor_tipo: string
  advogado_id: string | null
  advogado_nome: string | null
}

export interface AdvogadoOpcao {
  id: string
  nome: string
}

export function useListaCasos() {
  const [casos,     setCasos]     = useState<CasoLista[]>([])
  const [advogados, setAdvogados] = useState<AdvogadoOpcao[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const fetchCasos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [casosRes, advRes] = await Promise.all([
        supabase
          .from('casos')
          .select(`
            id, etapa_atual, status, data_abertura, numero_processo,
            titulos (
              valor_atualizado, data_limite_ajuizamento, status_prescricao,
              credores ( nome, tipo ),
              devedores ( nome, tipo )
            ),
            usuarios ( id, nome )
          `)
          .neq('status', 'ARQUIVADO')
          .order('data_abertura', { ascending: false }),

        supabase
          .from('usuarios')
          .select('id, nome')
          .in('role', ['ADVOGADO', 'ADMIN'])
          .eq('ativo', true)
          .order('nome'),
      ])

      if (casosRes.error) throw casosRes.error

      const casosFormatados: CasoLista[] = (casosRes.data ?? []).map(
        (raw: Record<string, unknown>) => {
          const titulo  = (Array.isArray(raw.titulos)          ? raw.titulos[0]          : raw.titulos)          as Record<string, unknown> ?? {}
          const credor  = (Array.isArray(titulo.credores)      ? titulo.credores[0]      : titulo.credores)      as Record<string, unknown> ?? {}
          const devedor = (Array.isArray(titulo.devedores)     ? titulo.devedores[0]     : titulo.devedores)     as Record<string, unknown> ?? {}
          const adv     = (Array.isArray(raw.usuarios)         ? raw.usuarios[0]         : raw.usuarios)         as Record<string, unknown> | null ?? null

          return {
            id:                      raw.id as string,
            etapa_atual:             raw.etapa_atual as string,
            status:                  raw.status as string,
            data_abertura:           raw.data_abertura as string,
            numero_processo:         raw.numero_processo as string | null,
            valor_atualizado:        (titulo.valor_atualizado as number) ?? 0,
            data_limite_ajuizamento: (titulo.data_limite_ajuizamento as string) ?? '',
            status_prescricao:       (titulo.status_prescricao as string) ?? 'VERDE',
            credor_nome:             (credor.nome  as string) ?? '',
            credor_tipo:             (credor.tipo  as string) ?? 'PF',
            devedor_nome:            (devedor.nome as string) ?? '',
            devedor_tipo:            (devedor.tipo as string) ?? 'PF',
            advogado_id:             adv ? (adv.id   as string) : null,
            advogado_nome:           adv ? (adv.nome as string) : null,
          }
        },
      )

      setCasos(casosFormatados)
      setAdvogados((advRes.data ?? []) as AdvogadoOpcao[])
    } catch (err) {
      setError('Erro ao carregar casos.')
      console.error('[useListaCasos]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const arquivarCaso = async (casoId: string) => {
    await supabase.from('casos').update({ status: 'ARQUIVADO' }).eq('id', casoId)
    void fetchCasos()
  }

  const alterarEtapa = async (casoId: string, novaEtapa: string) => {
    await supabase.from('casos').update({ etapa_atual: novaEtapa }).eq('id', casoId)
    void fetchCasos()
  }

  const registrarEvento = async (
    casoId: string,
    tipoEvento: string,
    descricao: string,
  ) => {
    const { data: me } = await supabase.auth.getUser()
    if (!me.user) return
    const { data: usuario } = await supabase
      .from('usuarios').select('id').eq('auth_id', me.user.id).single()
    if (!usuario) return
    await supabase.from('eventos_timeline').insert({
      caso_id: casoId, tipo_evento: tipoEvento,
      descricao, usuario_id: usuario.id,
    })
  }

  useEffect(() => { void fetchCasos() }, [fetchCasos])

  return {
    casos, advogados, loading, error,
    refetch: fetchCasos,
    arquivarCaso, alterarEtapa, registrarEvento,
  }
}
