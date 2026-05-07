import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ── Tipos ──────────────────────────────────────────────────────

export interface PassoRegua {
  dia:                      number       // D-5 a D+35
  canal:                    string       // 'whatsapp' | 'email' | 'whatsapp_email' | ...
  tom:                      'amigavel' | 'formal' | 'negociacao' | 'juridico' | 'automatico'
  template:                 string
  exige_resposta_anterior?: boolean
}

export interface RegraCobranca {
  id:          string
  nome:        string
  descricao:   string | null
  tipo_caso:   string | null
  ativa:       boolean
  passos_json: PassoRegua[]
  criado_por:  string | null
  created_at:  string
  updated_at:  string
}

export interface ExecucaoRegua {
  id:              string
  caso_id:         string
  regua_id:        string
  step_dia:        number
  canal:           string
  template:        string
  status:          'enviado' | 'entregue' | 'lido' | 'erro' | 'pulado' | 'pendente_sms'
  data_execucao:   string
  ia_personalizada: boolean
  ia_tom_detectado: string | null
  mensagem_enviada: string | null
  erro_msg:         string | null
}

export interface UseReguaReturn {
  regras:         RegraCobranca[]
  reguaAtiva:     RegraCobranca | null
  execucoes:      ExecucaoRegua[]
  isLoading:      boolean
  erro:           string | null
  reguaPausada:   boolean
  refetch:        () => Promise<void>
  salvarRegua:    (regra: Partial<RegraCobranca> & { id?: string }) => Promise<boolean>
  ativarRegua:    (id: string) => Promise<boolean>
  pausarRegua:    (caso_id: string, pausar: boolean) => Promise<boolean>
  excluirRegua:   (id: string) => Promise<boolean>
}

// ── Hook ───────────────────────────────────────────────────────

export function useRegua(caso_id?: string): UseReguaReturn {
  const [regras, setRegras]             = useState<RegraCobranca[]>([])
  const [reguaAtiva, setReguaAtiva]     = useState<RegraCobranca | null>(null)
  const [execucoes, setExecucoes]       = useState<ExecucaoRegua[]>([])
  const [reguaPausada, setReguaPausada] = useState(false)
  const [isLoading, setIsLoading]       = useState(true)
  const [erro, setErro]                 = useState<string | null>(null)

  const fetchRegras = useCallback(async () => {
    setIsLoading(true)
    setErro(null)

    try {
      const { data: regrasData, error: errRegras } = await supabase
        .from('regras_cobranca')
        .select('*')
        .order('created_at', { ascending: true })

      if (errRegras) throw errRegras
      setRegras((regrasData ?? []) as RegraCobranca[])

      if (caso_id) {
        const { data: casoData } = await supabase
          .from('casos')
          .select('regua_id, regua_pausada, regras_cobranca(*)')
          .eq('id', caso_id)
          .single()

        if (casoData) {
          const r = casoData as Record<string, unknown>
          setReguaPausada(!!(r.regua_pausada))
          const rc = Array.isArray(r.regras_cobranca) ? r.regras_cobranca[0] : r.regras_cobranca
          setReguaAtiva(rc ? (rc as RegraCobranca) : null)
        }

        const { data: execData } = await supabase
          .from('execucoes_regua')
          .select('*')
          .eq('caso_id', caso_id)
          .order('data_execucao', { ascending: false })
          .limit(100)

        setExecucoes((execData ?? []) as ExecucaoRegua[])
      } else {
        // Sem caso_id: régua ativa global
        const ativa = (regrasData ?? []).find((r: Record<string, unknown>) => r.ativa) ?? null
        setReguaAtiva(ativa as RegraCobranca | null)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar régua')
    } finally {
      setIsLoading(false)
    }
  }, [caso_id])

  useEffect(() => { fetchRegras() }, [fetchRegras])

  // ── Mutações ────────────────────────────────────────────────

  const salvarRegua = useCallback(async (
    regra: Partial<RegraCobranca> & { id?: string },
  ): Promise<boolean> => {
    try {
      if (regra.id) {
        const { error } = await supabase
          .from('regras_cobranca')
          .update({
            nome:        regra.nome,
            descricao:   regra.descricao,
            tipo_caso:   regra.tipo_caso,
            passos_json: regra.passos_json,
            updated_at:  new Date().toISOString(),
          })
          .eq('id', regra.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('regras_cobranca')
          .insert({
            nome:        regra.nome ?? 'Nova Régua',
            descricao:   regra.descricao ?? null,
            tipo_caso:   regra.tipo_caso ?? null,
            passos_json: regra.passos_json ?? [],
            ativa:       false,
          })
        if (error) throw error
      }
      await fetchRegras()
      return true
    } catch {
      return false
    }
  }, [fetchRegras])

  const ativarRegua = useCallback(async (id: string): Promise<boolean> => {
    try {
      // Desativa todas, ativa a selecionada
      await supabase.from('regras_cobranca').update({ ativa: false }).neq('id', id)
      const { error } = await supabase
        .from('regras_cobranca')
        .update({ ativa: true })
        .eq('id', id)
      if (error) throw error
      await fetchRegras()
      return true
    } catch {
      return false
    }
  }, [fetchRegras])

  const pausarRegua = useCallback(async (cid: string, pausar: boolean): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('casos')
        .update({
          regua_pausada:    pausar,
          regua_pausada_em: pausar ? new Date().toISOString() : null,
        })
        .eq('id', cid)
      if (error) throw error
      setReguaPausada(pausar)
      return true
    } catch {
      return false
    }
  }, [])

  const excluirRegua = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('regras_cobranca').delete().eq('id', id)
      if (error) throw error
      await fetchRegras()
      return true
    } catch {
      return false
    }
  }, [fetchRegras])

  return {
    regras,
    reguaAtiva,
    execucoes,
    isLoading,
    erro,
    reguaPausada,
    refetch:     fetchRegras,
    salvarRegua,
    ativarRegua,
    pausarRegua,
    excluirRegua,
  }
}
