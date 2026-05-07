/**
 * FichaCaso — Ficha completa do caso de cobrança.
 *
 * Layout 2 colunas:
 *   Esquerda (40%): dados fixos, credor, devedor, título, processo, pesquisa patrimonial
 *   Direita  (60%): ações rápidas, timeline, documentos, mini-kanban de tarefas
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format, parseISO, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft, RefreshCw, AlertTriangle, Building2,
  UserX, FileText, Scale, Search, Download,
  ExternalLink, Loader2, CheckCircle2, Clock,
} from 'lucide-react'

import { useFichaCaso } from '@/hooks/cobranca/useFichaCaso'
import TimelineCaso               from './TimelineCaso'
import PainelAcoes                from './PainelAcoes'
import PainelPagamento            from './PainelPagamento'
import PainelProtestoNegativacao  from './PainelProtestoNegativacao'
import PainelLGPD                 from './PainelLGPD'
import { supabase } from '@/lib/supabase'
import { formatarMoeda, formatarData } from '@/lib/utils'
import type { StatusPrescricao, EtapaCaso } from '@/types/cobranca'

// ── Constantes de exibição ────────────────────────────────────
const ETAPA_LABEL: Record<EtapaCaso, string> = {
  DIAGNOSTICO:            'Diagnóstico',
  ESTRATEGIA:             'Estratégia',
  COBRANCA_EXTRAJUDICIAL: 'Cobr. Extrajudicial',
  ACAO_JUDICIAL:          'Ação Judicial',
  EXECUCAO_RECUPERACAO:   'Execução',
}

const ETAPA_COR: Record<EtapaCaso, string> = {
  DIAGNOSTICO:            '#B89C5C',
  ESTRATEGIA:             '#8AA3BE',
  COBRANCA_EXTRAJUDICIAL: '#5A1E2A',
  ACAO_JUDICIAL:          '#1E3A5F',
  EXECUCAO_RECUPERACAO:   '#14532D',
}

const PRIORIDADE_COR: Record<string, React.CSSProperties> = {
  ALTA:  { backgroundColor: '#FEE2E2', color: '#991B1B' },
  MEDIA: { backgroundColor: '#FEF3C7', color: '#92400E' },
  BAIXA: { backgroundColor: '#F0FDF4', color: '#166534' },
}

const STATUS_TAREFA_LABEL: Record<string, string> = {
  A_FAZER:     'A Fazer',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDA:   'Concluída',
  BLOQUEADA:   'Bloqueada',
}

// ── Componentes de apoio ──────────────────────────────────────
function SectionCard({
  titulo, icon: Icon, children, defaultOpen = true,
}: { titulo: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border rounded overflow-hidden" style={{ borderColor: '#E2D9C8' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left transition-colors"
        style={{ backgroundColor: open ? '#FAFAF8' : 'white' }}
      >
        <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#5A1E2A' }}>
          <Icon size={12} color="#B89C5C" />
        </div>
        <span className="font-montserrat text-xs font-bold uppercase tracking-wide flex-1"
          style={{ color: '#1A1A1A' }}>
          {titulo}
        </span>
        <span className="font-lato text-xs" style={{ color: '#9B9B9B' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 bg-white" style={{ borderTop: '1px solid #E2D9C8' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-montserrat text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: '#9B9B9B' }}>
        {label}
      </span>
      <span className="font-lato text-sm" style={{ color: '#1A1A1A' }}>
        {value}
      </span>
    </div>
  )
}

function BadgePrescricao({ status, dias }: { status: string; dias: number }) {
  const cfg: Record<StatusPrescricao, { bg: string; text: string; label: string }> = {
    VERDE:    { bg: '#F0FDF4', text: '#166534', label: `${dias}d restantes` },
    AMARELO:  { bg: '#FFFBEB', text: '#92400E', label: `${dias}d — Atenção!` },
    VERMELHO: { bg: '#FEF2F2', text: '#991B1B', label: dias < 0 ? 'PRESCRITO' : `${dias}d — URGENTE` },
  }
  const c = cfg[status as StatusPrescricao] ?? cfg.VERDE
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-montserrat font-bold"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      <AlertTriangle size={11} />
      {c.label}
    </span>
  )
}

// Pesquisa patrimonial — campo editável inline
function CampoPesquisa({
  label, resultado, data, onSave,
}: {
  label:     string
  resultado: string | null
  data:      string | null
  onSave:    (resultado: string, data: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [val,  setVal]  = useState(resultado ?? '')
  const [dat,  setDat]  = useState(data ?? '')

  if (editando) {
    return (
      <div className="space-y-2 p-3 rounded" style={{ backgroundColor: '#F9F6F1', border: '1px solid #E2D9C8' }}>
        <p className="font-montserrat text-[10px] font-bold uppercase" style={{ color: '#5A1E2A' }}>{label}</p>
        <input value={dat} onChange={e => setDat(e.target.value)} type="date"
          className="w-full border rounded px-2 py-1.5 text-xs font-lato focus:outline-none focus:ring-1 focus:ring-[#5A1E2A]"
          style={{ borderColor: '#E2D9C8' }} />
        <textarea value={val} onChange={e => setVal(e.target.value)} rows={2}
          placeholder="Resultado da consulta..."
          className="w-full border rounded px-2 py-1.5 text-xs font-lato resize-none focus:outline-none focus:ring-1 focus:ring-[#5A1E2A]"
          style={{ borderColor: '#E2D9C8' }} />
        <div className="flex gap-2">
          <button onClick={() => { onSave(val, dat); setEditando(false) }}
            className="flex-1 py-1.5 rounded text-xs font-montserrat font-semibold text-white"
            style={{ backgroundColor: '#5A1E2A' }}>
            Salvar
          </button>
          <button onClick={() => setEditando(false)}
            className="py-1.5 px-3 rounded text-xs font-montserrat border"
            style={{ borderColor: '#E2D9C8', color: '#6B6B6B' }}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditando(true)}
      className="w-full text-left p-3 rounded border transition-colors hover:border-[#B89C5C] group"
      style={{ borderColor: '#E2D9C8', backgroundColor: resultado ? 'white' : '#FAFAF8' }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-montserrat text-[10px] font-bold uppercase" style={{ color: '#5A1E2A' }}>
          {label}
        </span>
        <span className="font-lato text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: '#B89C5C' }}>
          {resultado ? 'Editar' : 'Registrar'}
        </span>
      </div>
      {resultado ? (
        <>
          <p className="font-lato text-xs" style={{ color: '#1A1A1A' }}>{resultado}</p>
          {data && <p className="font-lato text-[10px] mt-0.5" style={{ color: '#9B9B9B' }}>
            Consulta: {format(parseISO(data), 'dd/MM/yyyy')}
          </p>}
        </>
      ) : (
        <p className="font-lato text-xs italic" style={{ color: '#C0C0C0' }}>Clique para registrar resultado</p>
      )}
    </button>
  )
}

// ── FichaCaso principal ───────────────────────────────────────
type AbaFicha = 'resumo' | 'timeline' | 'pagamentos' | 'protesto' | 'lgpd' | 'documentos'

export default function FichaCaso() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [abaAtiva, setAbaAtiva] = useState<AbaFicha>('resumo')
  const [protestosPendentes, setProtestosPendentes] = useState(0)

  const {
    caso, eventos, documentos, tarefas,
    loading, error, refetch,
    atualizarEtapa,
    atualizarPesquisaPatrimonial,
    registrarEvento,
    registrarComunicacao,
    atualizarStatusTarefa,
    salvarDocumentoPDF,
  } = useFichaCaso(id ?? '')

  useEffect(() => {
    if (!id) return
    supabase.from('protestos').select('id', { count: 'exact', head: true })
      .eq('caso_id', id).eq('status', 'aguardando_aprovacao')
      .then(({ count }) => setProtestosPendentes(count ?? 0))
  }, [id])

  // ── Loading / Erro ────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 size={32} className="animate-spin" style={{ color: '#B89C5C' }} />
        <p className="font-lato text-sm" style={{ color: '#9B9B9B' }}>Carregando ficha do caso...</p>
      </div>
    )
  }

  if (error || !caso) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertTriangle size={32} style={{ color: '#991B1B' }} />
        <p className="font-lato text-sm" style={{ color: '#991B1B' }}>
          {error ?? 'Caso não encontrado.'}
        </p>
        <button onClick={() => navigate('/cobranca/casos')}
          className="font-montserrat text-sm font-semibold" style={{ color: '#B89C5C' }}>
          ← Voltar à lista
        </button>
      </div>
    )
  }

  const { titulo } = caso
  const { credor, devedor } = titulo
  const diasPrescricao = differenceInDays(
    parseISO(titulo.data_limite_ajuizamento), new Date(),
  )

  // Etapa badge
  const etapaKey = caso.etapa_atual as EtapaCaso
  const etapaCor = ETAPA_COR[etapaKey] ?? '#374151'
  const etapaLabel = ETAPA_LABEL[etapaKey] ?? caso.etapa_atual

  // Mini-kanban groups
  const kanbanGrupos = ['A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDA'] as const
  const kanbanCores: Record<string, { header: string; bg: string }> = {
    A_FAZER:      { header: '#0D1B2A', bg: '#F0EBE0' },
    EM_ANDAMENTO: { header: '#B89C5C', bg: '#FFFBEB' },
    CONCLUIDA:    { header: '#14532D', bg: '#F0FDF4' },
  }

  return (
    <div>
      {/* Barra de navegação superior */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Link
            to="/cobranca/casos"
            className="flex items-center gap-1 font-montserrat text-xs font-semibold
                       transition-colors hover:opacity-80"
            style={{ color: '#B89C5C' }}
          >
            <ChevronLeft size={14} /> Lista de Casos
          </Link>
          <span style={{ color: '#E2D9C8' }}>/</span>
          <span className="font-montserrat text-xs" style={{ color: '#9B9B9B' }}>
            {devedor.nome}
          </span>
        </div>
        <button onClick={() => void refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-montserrat font-semibold
                     transition-colors border"
          style={{ borderColor: '#E2D9C8', color: '#6B6B6B' }}>
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {/* Layout 2 colunas */}
      <div className="flex flex-col xl:flex-row gap-5">

        {/* ── COLUNA ESQUERDA (40%) ──────────────────────────── */}
        <div className="xl:w-[40%] space-y-4">

          {/* Hero card */}
          <div
            className="rounded-lg overflow-hidden shadow-sm"
            style={{ border: '1px solid #E2D9C8' }}
          >
            {/* Header vinho */}
            <div className="px-5 py-4" style={{ backgroundColor: '#0D1B2A' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-montserrat text-[10px] font-semibold uppercase tracking-widest mb-1"
                    style={{ color: '#8AA3BE' }}>
                    Devedor
                  </p>
                  <h2 className="font-cinzel text-lg font-bold leading-tight truncate"
                    style={{ color: '#F5F5F5' }}>
                    {devedor.nome}
                  </h2>
                  <p className="font-lato text-xs mt-0.5" style={{ color: '#8AA3BE' }}>
                    Credor: {credor.nome}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-cinzel text-xl font-bold" style={{ color: '#B89C5C' }}>
                    {formatarMoeda(titulo.valor_atualizado)}
                  </p>
                  <p className="font-lato text-[10px] mt-0.5" style={{ color: '#8AA3BE' }}>
                    Valor atualizado
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {/* Badge de etapa */}
                <span
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-montserrat font-bold"
                  style={{ backgroundColor: etapaCor, color: 'white' }}
                >
                  {etapaLabel}
                </span>
                {/* Badge prescrição */}
                <BadgePrescricao status={titulo.status_prescricao} dias={diasPrescricao} />
                {/* Badge protesto pendente */}
                {protestosPendentes > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{ backgroundColor: '#FFFBEB', color: '#92400E', border: '1px solid #FCD34D' }}>
                    🔔 {protestosPendentes} protesto(s) pendente(s)
                  </span>
                )}
              </div>
            </div>

            {/* Dados rápidos */}
            <div className="px-5 py-3 grid grid-cols-2 gap-3 bg-white"
              style={{ borderTop: '1px solid #E2D9C8' }}>
              <InfoRow label="Abertura" value={formatarData(caso.data_abertura)} />
              <InfoRow label="Tipo do Título" value={titulo.tipo_titulo.replace(/_/g, ' ')} />
              <InfoRow label="Prazo Prescrição"
                value={`${titulo.prazo_prescricional_anos} anos — limite ${format(parseISO(titulo.data_limite_ajuizamento), 'dd/MM/yyyy')}`} />
              <InfoRow label="Status"
                value={
                  <span
                    className="inline-flex px-2 py-0.5 rounded text-xs font-montserrat font-semibold"
                    style={{ backgroundColor: caso.status === 'ATIVO' ? '#F0FDF4' : '#F3F4F6', color: caso.status === 'ATIVO' ? '#166534' : '#374151' }}>
                    {caso.status}
                  </span>
                }
              />
            </div>

            {/* Seletor de etapa */}
            <div className="px-5 py-3" style={{ borderTop: '1px solid #E2D9C8', backgroundColor: '#FAFAF8' }}>
              <p className="font-montserrat text-[10px] font-bold uppercase mb-2" style={{ color: '#9B9B9B' }}>
                Avançar etapa
              </p>
              <select
                value={caso.etapa_atual}
                onChange={e => void atualizarEtapa(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm font-lato bg-white
                  focus:outline-none focus:ring-2 focus:ring-[#5A1E2A]"
                style={{ borderColor: '#E2D9C8', color: '#1A1A1A' }}>
                {(Object.entries(ETAPA_LABEL) as [EtapaCaso, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Credor */}
          <SectionCard titulo="Credor" icon={Building2}>
            <div className="mt-3 space-y-2.5">
              <InfoRow label="Nome" value={credor.nome} />
              <InfoRow label="Tipo" value={credor.tipo} />
              {credor.email    && <InfoRow label="E-mail"   value={credor.email} />}
              {credor.whatsapp && <InfoRow label="WhatsApp" value={credor.whatsapp} />}
              {credor.telefone && <InfoRow label="Telefone" value={credor.telefone} />}
              {credor.endereco_completo && (
                <InfoRow label="Endereço" value={`${credor.endereco_completo}, ${credor.cidade}/${credor.estado}`} />
              )}
              {credor.representante_legal && (
                <InfoRow label="Representante"
                  value={`${credor.representante_legal.nome} — ${credor.representante_legal.cargo}`} />
              )}
            </div>
          </SectionCard>

          {/* Devedor */}
          <SectionCard titulo="Devedor" icon={UserX}>
            <div className="mt-3 space-y-2.5">
              <InfoRow label="Nome" value={devedor.nome} />
              <InfoRow label="Tipo" value={devedor.tipo} />
              <div>
                <span className="font-montserrat text-[10px] font-semibold uppercase tracking-wide block mb-1"
                  style={{ color: '#9B9B9B' }}>
                  Perfil de Risco
                </span>
                <span
                  className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-montserrat font-bold"
                  style={{
                    backgroundColor:
                      devedor.perfil_risco === 'alto'        ? '#FEE2E2'
                    : devedor.perfil_risco === 'medio'       ? '#FEF3C7'
                    : devedor.perfil_risco === 'baixo'       ? '#F0FDF4'
                    : '#F3F4F6',
                    color:
                      devedor.perfil_risco === 'alto'        ? '#991B1B'
                    : devedor.perfil_risco === 'medio'       ? '#92400E'
                    : devedor.perfil_risco === 'baixo'       ? '#166534'
                    : '#374151',
                  }}>
                  {devedor.perfil_risco.charAt(0).toUpperCase() + devedor.perfil_risco.slice(1)}
                </span>
              </div>
              {devedor.enderecos?.length > 0 && (
                <InfoRow label="Endereço" value={devedor.enderecos[0]} />
              )}
              {devedor.telefones?.length > 0 && (
                <InfoRow label="Telefone" value={devedor.telefones[0]} />
              )}
              {devedor.relacionamento_credor && (
                <InfoRow label="Relacionamento" value={devedor.relacionamento_credor} />
              )}
              {devedor.bens_conhecidos && (
                <div>
                  <span className="font-montserrat text-[10px] font-semibold uppercase tracking-wide block mb-1"
                    style={{ color: '#9B9B9B' }}>Bens Conhecidos</span>
                  {devedor.bens_conhecidos.imoveis?.length > 0 && (
                    <p className="font-lato text-xs" style={{ color: '#1A1A1A' }}>
                      Imóveis: {devedor.bens_conhecidos.imoveis.join(', ')}
                    </p>
                  )}
                  {devedor.bens_conhecidos.veiculos?.length > 0 && (
                    <p className="font-lato text-xs" style={{ color: '#1A1A1A' }}>
                      Veículos: {devedor.bens_conhecidos.veiculos.join(', ')}
                    </p>
                  )}
                  {devedor.bens_conhecidos.contas_bancarias?.length > 0 && (
                    <p className="font-lato text-xs" style={{ color: '#1A1A1A' }}>
                      Contas: {devedor.bens_conhecidos.contas_bancarias.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          {/* Título */}
          <SectionCard titulo="Título / Crédito" icon={FileText}>
            <div className="mt-3 space-y-2.5">
              <InfoRow label="Tipo" value={titulo.tipo_titulo.replace(/_/g, ' ')} />
              <InfoRow label="Valor Original" value={formatarMoeda(titulo.valor_original)} />
              <InfoRow label="Valor Atualizado" value={
                <span className="font-montserrat font-bold" style={{ color: '#5A1E2A' }}>
                  {formatarMoeda(titulo.valor_atualizado)}
                </span>
              } />
              <InfoRow label="Data Origem / Venc."
                value={`${formatarData(titulo.data_origem)} / ${formatarData(titulo.data_vencimento)}`} />
              <InfoRow label="Índice / Juros / Multa"
                value={`${titulo.indice_correcao} · ${titulo.juros_mensais}%/mês · ${titulo.multa_percentual}% multa`} />
              {titulo.observacoes_prova && (
                <InfoRow label="Observações" value={titulo.observacoes_prova} />
              )}
            </div>
          </SectionCard>

          {/* Processo */}
          <SectionCard titulo="Processo Judicial" icon={Scale} defaultOpen={false}>
            <div className="mt-3 space-y-2.5">
              <InfoRow label="Via Processual"
                value={caso.via_processual?.replace(/_/g, ' ') ?? 'A definir'} />
              <InfoRow label="Advogado Resp."
                value={caso.advogado ? `${caso.advogado.nome}${caso.advogado.oab ? ` — OAB ${caso.advogado.oab}` : ''}` : '—'} />
              {caso.numero_processo && (
                <InfoRow label="Nº Processo" value={
                  caso.link_tribunal
                    ? <a href={caso.link_tribunal} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1" style={{ color: '#B89C5C' }}>
                        {caso.numero_processo} <ExternalLink size={11} />
                      </a>
                    : caso.numero_processo
                } />
              )}
              {caso.tribunal && <InfoRow label="Tribunal / Vara" value={`${caso.tribunal}${caso.vara ? ` — ${caso.vara}` : ''}`} />}
            </div>
          </SectionCard>

          {/* Pesquisa Patrimonial */}
          <SectionCard titulo="Pesquisa Patrimonial" icon={Search} defaultOpen={false}>
            <div className="mt-3 space-y-2">
              <CampoPesquisa
                label="SISBAJUD — Bloqueio Bancário"
                resultado={caso.sisbajud_resultado}
                data={caso.sisbajud_data}
                onSave={(resultado, data) => void atualizarPesquisaPatrimonial({
                  sisbajud_resultado: resultado, sisbajud_data: data,
                })}
              />
              <CampoPesquisa
                label="RENAJUD — Veículos"
                resultado={caso.renajud_resultado}
                data={caso.renajud_data}
                onSave={(resultado, data) => void atualizarPesquisaPatrimonial({
                  renajud_resultado: resultado, renajud_data: data,
                })}
              />
              <CampoPesquisa
                label="INFOJUD — Bens Imóveis / Fiscal"
                resultado={caso.infojud_resultado}
                data={caso.infojud_data}
                onSave={(resultado, data) => void atualizarPesquisaPatrimonial({
                  infojud_resultado: resultado, infojud_data: data,
                })}
              />
            </div>
          </SectionCard>
        </div>

        {/* ── COLUNA DIREITA (60%) ───────────────────────────── */}
        <div className="xl:flex-1 space-y-0">

          {/* Tab bar */}
          <div className="bg-white rounded-t-lg border" style={{ borderColor: '#E2D9C8' }}>
            <div className="flex overflow-x-auto">
              {([
                { key: 'resumo',      label: 'Resumo'           },
                { key: 'timeline',    label: 'Timeline'          },
                { key: 'pagamentos',  label: 'Pagamentos'        },
                { key: 'protesto',    label: 'Protesto/Neg.'     },
                { key: 'lgpd',        label: 'LGPD'              },
                { key: 'documentos',  label: 'Documentos'        },
              ] as const).map(({ key, label }) => (
                <button key={key}
                  onClick={() => setAbaAtiva(key)}
                  className="px-4 py-3 text-xs font-montserrat font-semibold whitespace-nowrap border-b-2 transition-colors"
                  style={{
                    borderBottomColor: abaAtiva === key ? '#5A1E2A' : 'transparent',
                    color: abaAtiva === key ? '#5A1E2A' : '#9B9B9B',
                    backgroundColor: 'transparent',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="bg-white rounded-b-lg border border-t-0 shadow-sm" style={{ borderColor: '#E2D9C8' }}>

            {/* RESUMO — PainelAcoes */}
            {abaAtiva === 'resumo' && (
              <div className="p-4">
                <PainelAcoes
                  caso={caso}
                  onEnviarWA={(template, conteudo) =>
                    registrarComunicacao('WHATSAPP', template,
                      caso.titulo.devedor.telefones?.[0] ?? 'desconhecido', conteudo)
                  }
                  onEnviarEmail={(template, destinatario, conteudo) =>
                    registrarComunicacao('EMAIL', template, destinatario, conteudo)
                  }
                  onRegistrarEvento={(tipo, descricao) => registrarEvento(tipo, descricao)}
                  onSalvarPDF={(nome, url) => salvarDocumentoPDF(nome, url)}
                />
              </div>
            )}

            {/* TIMELINE */}
            {abaAtiva === 'timeline' && (
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={15} style={{ color: '#B89C5C' }} />
                  <span className="font-montserrat text-sm font-semibold" style={{ color: '#1A1A1A' }}>
                    Timeline do Caso
                  </span>
                  <span className="ml-auto font-montserrat text-xs" style={{ color: '#9B9B9B' }}>
                    {eventos.length} evento{eventos.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <TimelineCaso eventos={eventos} />
              </div>
            )}

            {/* PAGAMENTOS */}
            {abaAtiva === 'pagamentos' && (
              <PainelPagamento caso={caso} />
            )}

            {/* PROTESTO / NEGATIVAÇÃO */}
            {abaAtiva === 'protesto' && (
              <PainelProtestoNegativacao
                caso_id={caso.id}
                etapa_atual={caso.etapa_atual}
                valor_atual={caso.titulo.valor_atualizado}
                devedor_id={caso.titulo.devedor.id}
              />
            )}

            {/* LGPD */}
            {abaAtiva === 'lgpd' && (
              <PainelLGPD devedor_id={caso.titulo.devedor.id} />
            )}

            {/* DOCUMENTOS */}
            {abaAtiva === 'documentos' && (
              <div>
                <div className="px-5 py-3.5 flex items-center gap-2"
                  style={{ borderBottom: '1px solid #E2D9C8', backgroundColor: '#FAFAF8' }}>
                  <FileText size={15} style={{ color: '#B89C5C' }} />
                  <h3 className="font-montserrat text-sm font-semibold" style={{ color: '#1A1A1A' }}>
                    Documentos
                  </h3>
                </div>
                <div className="divide-y" style={{ '--tw-divide-color': '#E2D9C8' } as React.CSSProperties}>
                  {documentos.length === 0 ? (
                    <p className="px-5 py-6 text-center font-lato text-sm" style={{ color: '#9B9B9B' }}>
                      Nenhum documento anexado.
                    </p>
                  ) : documentos.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                      <FileText size={16} style={{ color: '#B89C5C', flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-lato text-sm truncate" style={{ color: '#1A1A1A' }}>
                          {doc.nome_arquivo}
                        </p>
                        <p className="font-lato text-[10px]" style={{ color: '#9B9B9B' }}>
                          {doc.tipo_documento} · {format(parseISO(doc.data_upload), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </p>
                      </div>
                      <a href={doc.url_storage} target="_blank" rel="noreferrer"
                        className="p-1.5 rounded border transition-colors hover:border-[#B89C5C]"
                        style={{ borderColor: '#E2D9C8', color: '#9B9B9B' }}>
                        <Download size={14} />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Mini-Kanban de Tarefas — mantido abaixo das abas */}
          <div className="bg-white rounded-lg border shadow-sm mt-5" style={{ borderColor: '#E2D9C8' }}>
            <div className="px-5 py-3.5 flex items-center gap-2"
              style={{ borderBottom: '1px solid #E2D9C8', backgroundColor: '#FAFAF8' }}>
              <CheckCircle2 size={15} style={{ color: '#B89C5C' }} />
              <h3 className="font-montserrat text-sm font-semibold" style={{ color: '#1A1A1A' }}>
                Tarefas do Caso
              </h3>
              <span className="ml-auto font-montserrat text-xs" style={{ color: '#9B9B9B' }}>
                {tarefas.length} tarefa{tarefas.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {kanbanGrupos.map(grupo => {
                const items = tarefas.filter(t => t.status === grupo)
                const cfg   = kanbanCores[grupo]
                return (
                  <div key={grupo}>
                    <div
                      className="flex items-center justify-between px-3 py-2 rounded-t"
                      style={{ backgroundColor: cfg.header }}
                    >
                      <span className="font-montserrat text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: 'white' }}>
                        {STATUS_TAREFA_LABEL[grupo]}
                      </span>
                      <span className="font-montserrat text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                        {items.length}
                      </span>
                    </div>
                    <div
                      className="min-h-20 rounded-b p-2 space-y-2"
                      style={{ backgroundColor: cfg.bg }}
                    >
                      {items.length === 0 && (
                        <p className="text-center font-lato text-[10px] py-3 italic"
                          style={{ color: '#9B9B9B' }}>
                          Nenhuma
                        </p>
                      )}
                      {items.map(t => (
                        <div key={t.id}
                          className="bg-white rounded p-2.5 border shadow-sm"
                          style={{ borderColor: '#E2D9C8' }}>
                          <p className="font-lato text-xs leading-tight mb-1.5"
                            style={{ color: '#1A1A1A' }}>
                            {t.descricao}
                          </p>
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-montserrat font-bold"
                              style={PRIORIDADE_COR[t.prioridade] ?? { backgroundColor: '#F3F4F6', color: '#374151' }}>
                              {t.prioridade}
                            </span>
                            <span className="font-lato text-[9px]" style={{ color: '#9B9B9B' }}>
                              {format(parseISO(t.prazo), 'dd/MM')}
                            </span>
                          </div>
                          {/* Avançar status */}
                          {grupo !== 'CONCLUIDA' && (
                            <button
                              onClick={() => void atualizarStatusTarefa(t.id,
                                grupo === 'A_FAZER' ? 'EM_ANDAMENTO' : 'CONCLUIDA'
                              )}
                              className="mt-2 w-full py-1 rounded text-[9px] font-montserrat font-semibold
                                         transition-colors border"
                              style={{ borderColor: cfg.header, color: cfg.header }}>
                              {grupo === 'A_FAZER' ? '▶ Iniciar' : '✓ Concluir'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
