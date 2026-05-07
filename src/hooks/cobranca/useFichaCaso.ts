import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ── Tipos retornados ──────────────────────────────────────────
export interface CasoCompleto {
  // Caso
  id:                  string
  titulo_id:           string
  via_processual:      string | null
  etapa_atual:         string
  status:              string
  data_abertura:       string
  data_encerramento:   string | null
  numero_processo:     string | null
  tribunal:            string | null
  vara:                string | null
  link_tribunal:       string | null
  sisbajud_resultado:  string | null
  sisbajud_data:       string | null
  renajud_resultado:   string | null
  renajud_data:        string | null
  infojud_resultado:   string | null
  infojud_data:        string | null
  // Relacionamentos
  titulo: {
    id:                        string
    tipo_titulo:               string
    valor_original:            number
    valor_atualizado:          number
    data_origem:               string
    data_vencimento:           string
    indice_correcao:           string
    juros_mensais:             number
    multa_percentual:          number
    prazo_prescricional_anos:  number
    data_limite_ajuizamento:   string
    status_prescricao:         string
    interrupcao_prescricao_data:   string | null
    interrupcao_prescricao_motivo: string | null
    observacoes_prova:         string | null
    credor: {
      id: string; nome: string; tipo: string; email: string | null
      whatsapp: string | null; telefone: string | null
      cpf_cnpj_enc: null; cep: string
      endereco_completo: string; cidade: string; estado: string
      profissao: string | null; ramo_atividade: string | null
      representante_legal: { nome: string; cpf: string; cargo: string } | null
    }
    devedor: {
      id: string; nome: string; tipo: string
      cpf_cnpj_enc: null; perfil_risco: string
      enderecos: string[]; telefones: string[]; emails: string[]
      bens_conhecidos: { imoveis: string[]; veiculos: string[]; contas_bancarias: string[] } | null
      contatavel_whatsapp: string
      relacionamento_credor: string | null
      advogado_devedor: string | null
    }
  }
  advogado: {
    id: string; nome: string; email: string; oab: string | null
  }
}

export interface EventoTimeline {
  id:          string
  tipo_evento: string
  descricao:   string
  data_evento: string
  usuario:     { nome: string } | null
}

export interface DocumentoCaso {
  id:             string
  nome_arquivo:   string
  url_storage:    string
  tipo_documento: string
  status:         string
  data_upload:    string
}

export interface TarefaCaso {
  id:          string
  descricao:   string
  prazo:       string
  prioridade:  string
  status:      string
  responsavel: { nome: string } | null
}

export interface PagamentoCaso {
  id:             string
  valor:          number
  data_pagamento: string
  tipo:           string
  observacao:     string | null
}

// ── Hook ─────────────────────────────────────────────────────
export function useFichaCaso(casoId: string) {
  const [caso,       setCaso]       = useState<CasoCompleto | null>(null)
  const [eventos,    setEventos]    = useState<EventoTimeline[]>([])
  const [documentos, setDocumentos] = useState<DocumentoCaso[]>([])
  const [tarefas,    setTarefas]    = useState<TarefaCaso[]>([])
  const [pagamentos, setPagamentos] = useState<PagamentoCaso[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  const fetchCaso = useCallback(async () => {
    if (!casoId) return
    setLoading(true)
    setError(null)

    try {
      const [casoRes, eventosRes, docsRes, tarefasRes, pagRes] = await Promise.all([
        supabase
          .from('casos')
          .select(`
            *,
            titulos (
              *,
              credores ( * ),
              devedores ( * )
            ),
            usuarios ( id, nome, email, oab )
          `)
          .eq('id', casoId)
          .single(),

        supabase
          .from('eventos_timeline')
          .select('id, tipo_evento, descricao, data_evento, usuarios ( nome )')
          .eq('caso_id', casoId)
          .order('data_evento', { ascending: false }),

        supabase
          .from('documentos')
          .select('*')
          .eq('caso_id', casoId)
          .eq('status', 'ATIVO')
          .order('data_upload', { ascending: false }),

        supabase
          .from('tarefas')
          .select('id, descricao, prazo, prioridade, status, usuarios ( nome )')
          .eq('caso_id', casoId)
          .order('prazo', { ascending: true }),

        supabase
          .from('pagamentos')
          .select('*')
          .eq('caso_id', casoId)
          .order('data_pagamento', { ascending: false }),
      ])

      if (casoRes.error)   throw casoRes.error
      if (eventosRes.error) throw eventosRes.error

      // Remapear joins aninhados (Supabase retorna como objeto ou array)
      const raw = casoRes.data as Record<string, unknown>
      const titulo  = (raw.titulos   as Record<string, unknown>) ?? {}
      const credor  = (titulo.credores  as Record<string, unknown>) ?? {}
      const devedor = (titulo.devedores as Record<string, unknown>) ?? {}
      const adv     = (raw.usuarios   as Record<string, unknown>) ?? {}

      const casoFormatado: CasoCompleto = {
        ...(raw as Omit<CasoCompleto, 'titulo' | 'advogado'>),
        titulo: {
          ...(titulo as Omit<CasoCompleto['titulo'], 'credor' | 'devedor'>),
          credor:  credor  as CasoCompleto['titulo']['credor'],
          devedor: devedor as CasoCompleto['titulo']['devedor'],
        },
        advogado: adv as CasoCompleto['advogado'],
      }

      setCaso(casoFormatado)

      // Supabase retorna a join `usuarios` como array; normalizar para objeto `usuario`
      const eventosNormalizados: EventoTimeline[] = (eventosRes.data ?? []).map((e: Record<string, unknown>) => ({
        id:          e.id as string,
        tipo_evento: e.tipo_evento as string,
        descricao:   e.descricao as string,
        data_evento: e.data_evento as string,
        usuario:     Array.isArray(e.usuarios)
          ? (e.usuarios[0] as { nome: string } | undefined) ?? null
          : (e.usuarios as { nome: string } | null) ?? null,
      }))

      const tarefasNormalizadas: TarefaCaso[] = (tarefasRes.data ?? []).map((t: Record<string, unknown>) => ({
        id:          t.id as string,
        descricao:   t.descricao as string,
        prazo:       t.prazo as string,
        prioridade:  t.prioridade as string,
        status:      t.status as string,
        responsavel: Array.isArray(t.usuarios)
          ? (t.usuarios[0] as { nome: string } | undefined) ?? null
          : (t.usuarios as { nome: string } | null) ?? null,
      }))

      setEventos(eventosNormalizados)
      setDocumentos((docsRes.data ?? [])  as DocumentoCaso[])
      setTarefas(tarefasNormalizadas)
      setPagamentos((pagRes.data ?? [])   as PagamentoCaso[])
    } catch (err) {
      setError('Erro ao carregar dados do caso.')
      console.error('[useFichaCaso]', err)
    } finally {
      setLoading(false)
    }
  }, [casoId])

  useEffect(() => { void fetchCaso() }, [fetchCaso])

  // ── Mutações ────────────────────────────────────────────────

  const atualizarEtapa = async (novaEtapa: string) => {
    await supabase.from('casos').update({ etapa_atual: novaEtapa }).eq('id', casoId)
    await fetchCaso()
  }

  const atualizarPesquisaPatrimonial = async (campos: {
    sisbajud_resultado?: string; sisbajud_data?: string
    renajud_resultado?:  string; renajud_data?:  string
    infojud_resultado?:  string; infojud_data?:  string
  }) => {
    await supabase.from('casos').update(campos).eq('id', casoId)
    void fetchCaso()
  }

  const registrarEvento = async (tipoEvento: string, descricao: string) => {
    const { data: me } = await supabase.auth.getUser()
    if (!me.user) return
    const { data: usuario } = await supabase
      .from('usuarios').select('id').eq('auth_id', me.user.id).single()
    if (!usuario) return
    await supabase.from('eventos_timeline').insert({
      caso_id: casoId, tipo_evento: tipoEvento,
      descricao, usuario_id: usuario.id,
    })
    void fetchCaso()
  }

  const registrarComunicacao = async (canal: string, tipoTemplate: string, destinatario: string, conteudo: string) => {
    await supabase.from('comunicacoes').insert({
      caso_id: casoId, canal, tipo_template: tipoTemplate,
      destinatario, conteudo, status_envio: 'ENVIADO',
    })
    await registrarEvento('COMUNICACAO_ENVIADA',
      `${canal}: ${tipoTemplate} enviado para ${destinatario}`)
  }

  const atualizarStatusTarefa = async (tarefaId: string, novoStatus: string) => {
    await supabase.from('tarefas').update({ status: novoStatus }).eq('id', tarefaId)
    void fetchCaso()
  }

  const salvarDocumentoPDF = async (nomeArquivo: string, urlStorage: string) => {
    await supabase.from('documentos').insert({
      caso_id: casoId, nome_arquivo: nomeArquivo,
      url_storage: urlStorage, tipo_documento: 'PDF', status: 'ATIVO',
    })
    await registrarEvento('COMUNICACAO_ENVIADA',
      `Notificação extrajudicial gerada em PDF: ${nomeArquivo}`)
    void fetchCaso()
  }

  return {
    caso, eventos, documentos, tarefas, pagamentos,
    loading, error,
    refetch: fetchCaso,
    atualizarEtapa,
    atualizarPesquisaPatrimonial,
    registrarEvento,
    registrarComunicacao,
    atualizarStatusTarefa,
    salvarDocumentoPDF,
  }
}
