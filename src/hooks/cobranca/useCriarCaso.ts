import { useState } from 'react'
import { format, parseISO, differenceInMonths } from 'date-fns'
import { supabase } from '@/lib/supabase'
import {
  calcularPrazoPrescricial,
  calcularDataLimiteAjuizamento,
  calcularStatusPrescricao,
} from '@/lib/calculosPrescricao'
import type { EtapaCaso, ViaProcessual, IndiceCorrecao, TipoTitulo } from '@/types/cobranca'

// ── Tipos dos dados de cada step ─────────────────────────────
export interface CredorFormData {
  tipo: 'PF' | 'PJ'
  nome: string
  cpf_cnpj: string
  rg_inscricao_estadual?: string
  data_nascimento_fundacao?: string
  email?: string
  whatsapp?: string
  telefone?: string
  cep: string
  logradouro: string
  numero: string
  complemento?: string
  bairro: string
  cidade: string
  estado: string
  profissao?: string
  ramo_atividade?: string
  representante_legal_nome?: string
  representante_legal_cpf?: string
  representante_legal_cargo?: string
}

export interface DevedorFormData {
  tipo: 'PF' | 'PJ' | 'DESCONHECIDO'
  nome: string
  cpf_cnpj?: string
  perfil_risco: 'baixo' | 'medio' | 'alto' | 'desconhecido'
  enderecos: string[]
  telefones: string[]
  emails: string[]
  bens_imoveis?: string
  bens_veiculos?: string
  bens_contas?: string
  relacionamento_credor?: string
  advogado_devedor?: string
  contatavel_whatsapp: 'sim' | 'nao' | 'tentativa'
  observacoes?: string
}

export interface TituloFormData {
  tipo_titulo: TipoTitulo
  valor_original: number
  data_origem: string
  data_vencimento: string
  indice_correcao: IndiceCorrecao
  juros_mensais: number
  multa_percentual: number
  observacoes_prova?: string
  arquivos?: File[]
}

export interface EstrategiaFormData {
  via_processual?: ViaProcessual
  advogado_id: string
  etapa_atual: EtapaCaso
  observacoes_internas?: string
}

export interface NovoCasoPayload {
  credor: CredorFormData
  devedor: DevedorFormData
  titulo: TituloFormData
  estrategia: EstrategiaFormData
}

// ── Cálculo simplificado do valor atualizado ─────────────────
export function calcularValorAtualizado(
  valorOriginal: number,
  dataOrigem: string,
  jurosMensais: number,
  multaPercentual: number,
): number {
  const meses = Math.max(0, differenceInMonths(new Date(), parseISO(dataOrigem)))
  const fatorJuros = Math.pow(1 + jurosMensais / 100, meses)
  const valorComJuros = valorOriginal * fatorJuros
  const multa = valorOriginal * (multaPercentual / 100)
  return Math.round((valorComJuros + multa) * 100) / 100
}

// ── Hook principal ────────────────────────────────────────────
export function useCriarCaso() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const criarCaso = async (payload: NovoCasoPayload): Promise<string | null> => {
    setLoading(true)
    setError(null)

    try {
      // 1. Credor
      const credorEndereco = [
        payload.credor.logradouro,
        payload.credor.numero,
        payload.credor.complemento,
        payload.credor.bairro,
      ]
        .filter(Boolean)
        .join(', ')

      const representante =
        payload.credor.tipo === 'PJ' && payload.credor.representante_legal_nome
          ? {
              nome:  payload.credor.representante_legal_nome,
              cpf:   payload.credor.representante_legal_cpf ?? '',
              cargo: payload.credor.representante_legal_cargo ?? '',
            }
          : null

      const { data: credorData, error: errCreador } = await supabase
        .from('credores')
        .insert({
          tipo:                    payload.credor.tipo,
          nome:                    payload.credor.nome,
          rg_inscricao_estadual:   payload.credor.rg_inscricao_estadual,
          data_nascimento_fundacao: payload.credor.data_nascimento_fundacao || null,
          email:                   payload.credor.email,
          whatsapp:                payload.credor.whatsapp,
          telefone:                payload.credor.telefone,
          cep:                     payload.credor.cep.replace(/\D/g, ''),
          endereco_completo:       credorEndereco,
          cidade:                  payload.credor.cidade,
          estado:                  payload.credor.estado,
          profissao:               payload.credor.profissao,
          ramo_atividade:          payload.credor.ramo_atividade,
          representante_legal:     representante,
        })
        .select('id')
        .single()

      if (errCreador) throw new Error(`Credor: ${errCreador.message}`)

      // 2. Devedor
      const bensConhecidos = {
        imoveis:           payload.devedor.bens_imoveis
          ? payload.devedor.bens_imoveis.split('\n').filter(Boolean)
          : [],
        veiculos:          payload.devedor.bens_veiculos
          ? payload.devedor.bens_veiculos.split('\n').filter(Boolean)
          : [],
        contas_bancarias:  payload.devedor.bens_contas
          ? payload.devedor.bens_contas.split('\n').filter(Boolean)
          : [],
      }

      const { data: devedorData, error: errDevedor } = await supabase
        .from('devedores')
        .insert({
          tipo:                 payload.devedor.tipo,
          nome:                 payload.devedor.nome,
          perfil_risco:         payload.devedor.perfil_risco,
          enderecos:            payload.devedor.enderecos.filter(Boolean),
          telefones:            payload.devedor.telefones.filter(Boolean),
          emails:               payload.devedor.emails.filter(Boolean),
          bens_conhecidos:      bensConhecidos,
          relacionamento_credor: payload.devedor.relacionamento_credor,
          advogado_devedor:     payload.devedor.advogado_devedor,
          contatavel_whatsapp:  payload.devedor.contatavel_whatsapp,
          observacoes:          payload.devedor.observacoes,
        })
        .select('id')
        .single()

      if (errDevedor) throw new Error(`Devedor: ${errDevedor.message}`)

      // 3. Título — com cálculo de prescrição
      const prazo = calcularPrazoPrescricial(payload.titulo.tipo_titulo)
      const dataLimite = calcularDataLimiteAjuizamento(
        payload.titulo.data_origem,
        prazo,
      )
      const statusPrescricao = calcularStatusPrescricao(dataLimite)
      const valorAtualizado  = calcularValorAtualizado(
        payload.titulo.valor_original,
        payload.titulo.data_origem,
        payload.titulo.juros_mensais,
        payload.titulo.multa_percentual,
      )

      const { data: tituloData, error: errTitulo } = await supabase
        .from('titulos')
        .insert({
          credor_id:                credorData.id,
          devedor_id:               devedorData.id,
          tipo_titulo:              payload.titulo.tipo_titulo,
          valor_original:           payload.titulo.valor_original,
          data_origem:              payload.titulo.data_origem,
          data_vencimento:          payload.titulo.data_vencimento,
          indice_correcao:          payload.titulo.indice_correcao,
          juros_mensais:            payload.titulo.juros_mensais,
          multa_percentual:         payload.titulo.multa_percentual,
          valor_atualizado:         valorAtualizado,
          prazo_prescricional_anos: prazo,
          data_inicio_prescricao:   payload.titulo.data_origem,
          data_limite_ajuizamento:  format(dataLimite, 'yyyy-MM-dd'),
          status_prescricao:        statusPrescricao,
          observacoes_prova:        payload.titulo.observacoes_prova,
        })
        .select('id')
        .single()

      if (errTitulo) throw new Error(`Título: ${errTitulo.message}`)

      // 4. Caso
      const { data: casoData, error: errCaso } = await supabase
        .from('casos')
        .insert({
          titulo_id:      tituloData.id,
          via_processual: payload.estrategia.via_processual ?? null,
          etapa_atual:    payload.estrategia.etapa_atual,
          advogado_id:    payload.estrategia.advogado_id,
          status:         'ATIVO',
          data_abertura:  format(new Date(), 'yyyy-MM-dd'),
        })
        .select('id')
        .single()

      if (errCaso) throw new Error(`Caso: ${errCaso.message}`)

      // 5. Evento de abertura na timeline
      const { data: userData } = await supabase.auth.getUser()
      if (userData.user) {
        const { data: usuarioRow } = await supabase
          .from('usuarios')
          .select('id')
          .eq('auth_id', userData.user.id)
          .single()

        if (usuarioRow) {
          await supabase.from('eventos_timeline').insert({
            caso_id:     casoData.id,
            tipo_evento: 'ABERTURA_CASO',
            descricao:   `Caso aberto via sistema. Credor: ${payload.credor.nome}. Devedor: ${payload.devedor.nome}.`,
            usuario_id:  usuarioRow.id,
          })
        }
      }

      // 6. Upload de documentos (se houver)
      if (payload.titulo.arquivos?.length) {
        const bucket = import.meta.env.VITE_STORAGE_BUCKET ?? 'documentos-cobranca'
        for (const file of payload.titulo.arquivos) {
          const path = `${casoData.id}/${Date.now()}_${file.name}`
          const { data: uploadData, error: errUpload } = await supabase.storage
            .from(bucket)
            .upload(path, file)

          if (!errUpload && uploadData) {
            const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
            await supabase.from('documentos').insert({
              caso_id:        casoData.id,
              nome_arquivo:   file.name,
              url_storage:    urlData.publicUrl,
              tipo_documento: file.type.includes('pdf') ? 'PDF' : 'IMAGEM',
              status:         'ATIVO',
            })
          }
        }
      }

      return casoData.id as string
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido ao criar caso.'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }

  return { criarCaso, loading, error }
}
