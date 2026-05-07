/**
 * Dashboard.tsx — Painel principal do sistema A&C Legal Desk.
 *
 * Seções:
 *   1. KPI Cards — métricas de casos e valores
 *   2. Alertas de Prescrição — 30 / 60 / 90 dias (vermelho → laranja → amarelo)
 *   3. Pipeline — gráfico de barras com distribuição por etapa
 *   4. Tarefas urgentes — vencidas e para hoje
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  Briefcase,
  TrendingUp,
  DollarSign,
  Target,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Calendar,
  Scale,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { useCasos } from '@/hooks/cobranca/useCasos'
import { usePrescricao, getFaixaAlerta } from '@/hooks/cobranca/usePrescricao'
import { usePrazos } from '@/hooks/cobranca/usePrazos'
import { formatarMoeda } from '@/lib/utils'
import type { EtapaCaso, PrioridadeTarefa } from '@/types/cobranca'

// ── Mapa de etapas ────────────────────────────────────────────
const ETAPA_LABEL: Record<EtapaCaso, string> = {
  DIAGNOSTICO:             'Diagnóstico',
  ESTRATEGIA:              'Estratégia',
  COBRANCA_EXTRAJUDICIAL:  'Cobr. Extra.',
  ACAO_JUDICIAL:           'Ação Judicial',
  EXECUCAO_RECUPERACAO:    'Execução',
}

const ETAPA_COR: Record<EtapaCaso, string> = {
  DIAGNOSTICO:             '#1e3a5a',
  ESTRATEGIA:              '#2a4a2a',
  COBRANCA_EXTRAJUDICIAL:  '#4a3a00',
  ACAO_JUDICIAL:           '#3a1a00',
  EXECUCAO_RECUPERACAO:    '#5A1220',
}

// ── Tooltip customizado do gráfico ───────────────────────────
interface TooltipPayload {
  name: string
  value: number
  payload: { etapa: string; quantidade: number; cor: string }
}

function PipelineTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div
      className="px-3 py-2 rounded shadow-lg text-xs font-montserrat"
      style={{ backgroundColor: '#0E1B2A', border: '1px solid rgba(183,154,90,0.3)', color: '#F5F5F5' }}
    >
      <p className="font-semibold" style={{ color: '#B79A5A' }}>{d.etapa}</p>
      <p className="mt-0.5">{d.quantidade} caso{d.quantidade !== 1 ? 's' : ''}</p>
    </div>
  )
}

// ── Componente: KPI Card ──────────────────────────────────────
interface KpiCardProps {
  titulo: string
  valor: string
  subtitulo?: string
  icon: React.ElementType
  iconBg: string
  tendencia?: { positiva: boolean; texto: string }
  loading?: boolean
}

function KpiCard({ titulo, valor, subtitulo, icon: Icon, iconBg, tendencia, loading }: KpiCardProps) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      className="bg-white rounded p-5 flex items-start gap-4 shadow-sm"
      style={{
        border: '1px solid rgba(183,154,90,0.2)',
        borderTop: '2px solid #B79A5A',
        borderRadius: 10,
        transition: 'border-color 150ms, transform 150ms',
        ...(hovered ? { borderColor: 'rgba(183,154,90,0.55)', transform: 'translateY(-1px)' } : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: iconBg }}
      >
        <Icon size={20} color="#F5F5F5" />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="font-montserrat truncate uppercase"
          style={{ fontSize: 10, color: '#B79A5A', letterSpacing: '1.5px' }}
        >
          {titulo}
        </p>
        {loading ? (
          <div className="mt-1.5 h-6 w-28 rounded animate-pulse" style={{ backgroundColor: '#E2D9C8' }} />
        ) : (
          <p className="mt-1 font-cinzel font-bold leading-none" style={{ fontSize: 24, color: '#1A1A1A' }}>
            {valor}
          </p>
        )}
        {subtitulo && !loading && (
          <p className="mt-1 font-lato text-xs" style={{ color: '#9B9B9B' }}>{subtitulo}</p>
        )}
        {tendencia && !loading && (
          <p
            className="mt-1 font-montserrat text-xs font-medium"
            style={{ color: tendencia.positiva ? '#2D6A4F' : '#991B1B' }}
          >
            {tendencia.positiva ? '▲' : '▼'} {tendencia.texto}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Componente: Badge de prazo ────────────────────────────────
function BadgeDias({ dias }: { dias: number }) {
  const faixa = getFaixaAlerta(dias)
  const cfg = {
    prescrito:  { bg: '#1A0000', text: '#FF6B6B', label: 'PRESCRITO' },
    critico:    { bg: '#4A0000', text: '#FF8080', label: `${dias}d` },
    urgente:    { bg: '#4A2000', text: '#FFAA55', label: `${dias}d` },
    atencao:    { bg: '#3A3A00', text: '#FFD700', label: `${dias}d` },
  }[faixa]

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-montserrat font-bold tracking-wide"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      <AlertTriangle size={9} />
      {cfg.label}
    </span>
  )
}

// ── Componente: Linha de alerta de prescrição ─────────────────
function AlertaRow({
  devedor, credor, valor, diasRestantes, dataLimite, casoId,
}: {
  devedor: string
  credor: string
  valor: number
  diasRestantes: number
  dataLimite: string
  casoId: string
}) {
  const navigate = useNavigate()
  const faixa = getFaixaAlerta(diasRestantes)

  const borderCor = {
    prescrito: '#5a0000',
    critico:   '#7a3000',
    urgente:   '#5a4a00',
    atencao:   '#2d5a2d',
  }[faixa]

  return (
    <button
      onClick={() => navigate(`/cobranca/casos/${casoId}`)}
      className="w-full text-left flex items-center justify-between gap-3 px-4 py-3 rounded
                 transition-colors hover:bg-gray-50 group"
      style={{ borderLeft: `3px solid ${borderCor}` }}
    >
      <div className="min-w-0 flex-1">
        <p className="font-montserrat text-sm font-semibold truncate" style={{ color: '#1A1A1A' }}>
          {devedor}
        </p>
        <p className="font-lato text-xs truncate mt-0.5" style={{ color: '#6B6B6B' }}>
          Credor: {credor} · {formatarMoeda(valor)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-right hidden sm:block">
          <BadgeDias dias={diasRestantes} />
          <p className="font-lato text-[10px] mt-1" style={{ color: '#9B9B9B' }}>
            Limite: {format(parseISO(dataLimite), 'dd/MM/yy')}
          </p>
        </div>
        <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: '#B79A5A' }} />
      </div>
    </button>
  )
}

// ── Componente: Badge de prioridade de tarefa ─────────────────
function PrioridadeBadge({ prioridade }: { prioridade: PrioridadeTarefa }) {
  const cfg = {
    ALTA:  { bg: '#FEE2E2', text: '#991B1B', label: 'Alta' },
    MEDIA: { bg: '#FEF3C7', text: '#92400E', label: 'Média' },
    BAIXA: { bg: '#F0FDF4', text: '#166534', label: 'Baixa' },
  }[prioridade]
  return (
    <span
      className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-montserrat font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  )
}

// ── Componente principal: Dashboard ──────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const { metricas, loading: loadingCasos, error: errCasos, refetch: refetchCasos } = useCasos()
  const { alertas, loading: loadingPresc, error: errPresc, refetch: refetchPresc } = usePrescricao(90)
  const { vencidas, hoje, loading: loadingTarefas, error: errTarefas, refetch: refetchTarefas } = usePrazos()

  const isLoading = loadingCasos || loadingPresc || loadingTarefas
  const hasError  = errCasos || errPresc || errTarefas

  const handleRefresh = () => {
    void refetchCasos()
    void refetchPresc()
    void refetchTarefas()
  }

  // Dados do gráfico de pipeline
  const pipelineData = (Object.entries(metricas.casos_por_etapa) as [EtapaCaso, number][]).map(
    ([etapa, quantidade]) => ({
      etapa: ETAPA_LABEL[etapa],
      etapaKey: etapa,
      quantidade,
      cor: ETAPA_COR[etapa],
    }),
  )

  const dataAtual = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className="space-y-6">

      {/* ── Cabeçalho ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-cinzel text-2xl font-bold" style={{ color: '#5A1220' }}>
            Dashboard
          </h1>
          <p className="font-lato text-sm capitalize mt-0.5" style={{ color: '#9B9B9B' }}>
            {dataAtual}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded text-sm font-montserrat font-semibold
                     text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#5A1220' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B79A5A' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#5A1220' }}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Erro global */}
      {hasError && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded text-sm font-lato"
          style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}
          role="alert"
        >
          <AlertTriangle size={16} />
          <span>
            {errCasos ?? errPresc ?? errTarefas}
            {' '}— Configure as variáveis de ambiente Supabase para carregar dados reais.
          </span>
        </div>
      )}

      {/* VINDEX Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="flex items-center justify-between" style={{ paddingBottom: 12, borderBottom: '1px solid rgba(183,154,90,0.15)' }}>
          <div>
            <p style={{ fontFamily: "'Cinzel', serif", fontSize: 13, color: '#B79A5A', letterSpacing: 3, lineHeight: 1.2 }}>VINDEX</p>
            <p style={{ fontFamily: "'Lato', sans-serif", fontWeight: 300, fontSize: 10, color: '#555', marginTop: 2 }}>Legal Desk</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontFamily: "'Lato', sans-serif", fontSize: 13, color: '#8a9ab0' }}>
              {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
        </div>
      </div>

      {/* ── Seção 1: KPI Cards ──────────────────────────────── */}
      <section>
        <h2 className="font-montserrat text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: '#9B9B9B' }}>
          Visão Geral
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            titulo="Casos Ativos"
            valor={metricas.total_ativos.toString()}
            subtitulo="Em acompanhamento"
            icon={Briefcase}
            iconBg="#5A1220"
            loading={loadingCasos}
          />
          <KpiCard
            titulo="Valor em Cobrança"
            valor={formatarMoeda(metricas.valor_total_cobranca)}
            subtitulo="Valor atualizado total"
            icon={DollarSign}
            iconBg="#0E1B2A"
            loading={loadingCasos}
          />
          <KpiCard
            titulo="Recuperado no Mês"
            valor={formatarMoeda(metricas.valor_recuperado_mes)}
            subtitulo={`Total acumulado: ${formatarMoeda(metricas.valor_recuperado_total)}`}
            icon={TrendingUp}
            iconBg="#2D6A4F"
            loading={loadingCasos}
          />
          <KpiCard
            titulo="Taxa de Sucesso"
            valor={`${metricas.taxa_sucesso_extrajudicial}% / ${metricas.taxa_sucesso_judicial}%`}
            subtitulo="Extrajudicial / Judicial"
            icon={Target}
            iconBg="#B79A5A"
            loading={loadingCasos}
          />
        </div>
      </section>

      {/* ── Seção 2 + 3: Alertas e Pipeline ─────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Alertas de Prescrição — 3/5 da largura */}
        <section
          className="xl:col-span-3 bg-white rounded border shadow-sm overflow-hidden"
          style={{ borderColor: '#E2D9C8' }}
        >
          {/* Header da seção */}
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: '1px solid #E2D9C8', backgroundColor: '#FAFAF8' }}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} style={{ color: '#B79A5A' }} />
              <h2 className="font-montserrat text-sm font-semibold" style={{ color: '#1A1A1A' }}>
                Alertas de Prescrição
              </h2>
              {alertas.length > 0 && (
                <span
                  className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-montserrat"
                  style={{ backgroundColor: '#5A1220', color: '#F5F5F5' }}
                >
                  {alertas.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[10px] font-montserrat font-semibold">
              <span className="flex items-center gap-1" style={{ color: '#FFD700' }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#FFD700' }} />
                61–90d
              </span>
              <span className="flex items-center gap-1" style={{ color: '#FFB347' }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#FFB347' }} />
                31–60d
              </span>
              <span className="flex items-center gap-1" style={{ color: '#FF6B35' }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#FF6B35' }} />
                0–30d
              </span>
              <span className="flex items-center gap-1" style={{ color: '#FF4444' }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#FF4444' }} />
                Prescrito
              </span>
            </div>
          </div>

          {/* Lista */}
          <div className="divide-y max-h-80 overflow-y-auto" style={{ '--tw-divide-color': '#F0EBE0' } as React.CSSProperties}>
            {loadingPresc ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 rounded w-40 animate-pulse" style={{ backgroundColor: '#E2D9C8' }} />
                    <div className="h-3 rounded w-60 animate-pulse" style={{ backgroundColor: '#F0EBE0' }} />
                  </div>
                  <div className="h-5 rounded-full w-12 animate-pulse" style={{ backgroundColor: '#E2D9C8' }} />
                </div>
              ))
            ) : alertas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <CheckCircle2 size={32} style={{ color: '#2D6A4F', opacity: 0.4 }} />
                <p className="font-lato text-sm" style={{ color: '#9B9B9B' }}>
                  Nenhum caso com prescrição nos próximos 90 dias.
                </p>
              </div>
            ) : (
              alertas.map(a => (
                <AlertaRow
                  key={a.titulo_id}
                  devedor={a.devedor_nome}
                  credor={a.credor_nome}
                  valor={a.valor_atualizado}
                  diasRestantes={a.dias_restantes}
                  dataLimite={a.data_limite}
                  casoId={a.caso_id}
                />
              ))
            )}
          </div>

          {alertas.length > 0 && (
            <div
              className="px-5 py-2.5 text-right"
              style={{ borderTop: '1px solid #E2D9C8', backgroundColor: '#FAFAF8' }}
            >
              <button
                onClick={() => navigate('/cobranca/prazos')}
                className="font-montserrat text-xs font-semibold transition-colors"
                style={{ color: '#B79A5A' }}
              >
                Ver calendário de prazos →
              </button>
            </div>
          )}
        </section>

        {/* Pipeline — 2/5 da largura */}
        <section
          className="xl:col-span-2 bg-white rounded border shadow-sm overflow-hidden"
          style={{ borderColor: '#E2D9C8' }}
        >
          <div
            className="flex items-center gap-2 px-5 py-3.5"
            style={{ borderBottom: '1px solid #E2D9C8', backgroundColor: '#FAFAF8' }}
          >
            <Scale size={16} style={{ color: '#B79A5A' }} />
            <h2 className="font-montserrat text-sm font-semibold" style={{ color: '#1A1A1A' }}>
              Pipeline de Casos
            </h2>
          </div>

          <div className="px-4 pt-4 pb-2">
            {loadingCasos ? (
              <div className="h-52 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: '#E2D9C8', borderTopColor: '#5A1220' }} />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart
                  data={pipelineData}
                  margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                  barSize={28}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#E2D9C8"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="etapa"
                    tick={{ fontSize: 9, fontFamily: 'Montserrat', fill: '#9B9B9B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fontFamily: 'Montserrat', fill: '#9B9B9B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<PipelineTooltip />} cursor={{ fill: 'rgba(183,154,90,0.06)' }} />
                  <Bar dataKey="quantidade" radius={[3, 3, 0, 0]}>
                    {pipelineData.map((entry, index) => (
                      <Cell key={index} fill={entry.cor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Legenda */}
          {!loadingCasos && (
            <div className="px-4 pb-4 grid grid-cols-1 gap-1">
              {pipelineData.map(d => (
                <div key={d.etapaKey} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: d.cor }}
                    />
                    <span className="font-lato text-[11px]" style={{ color: '#6B6B6B' }}>
                      {ETAPA_LABEL[d.etapaKey as EtapaCaso]}
                    </span>
                  </div>
                  <span className="font-montserrat text-[11px] font-semibold" style={{ color: '#1A1A1A' }}>
                    {d.quantidade}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Seção 4: Tarefas urgentes ───────────────────────── */}
      <section
        className="bg-white rounded border shadow-sm overflow-hidden"
        style={{ borderColor: '#E2D9C8' }}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid #E2D9C8', backgroundColor: '#FAFAF8' }}
        >
          <div className="flex items-center gap-2">
            <Clock size={16} style={{ color: '#B79A5A' }} />
            <h2 className="font-montserrat text-sm font-semibold" style={{ color: '#1A1A1A' }}>
              Tarefas Urgentes
            </h2>
          </div>
          <button
            onClick={() => navigate('/cobranca/tarefas')}
            className="font-montserrat text-xs font-semibold transition-colors"
            style={{ color: '#B79A5A' }}
          >
            Ver todas →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x"
          style={{ '--tw-divide-opacity': '1', borderColor: '#E2D9C8' } as React.CSSProperties}>

          {/* Vencidas */}
          <div>
            <div
              className="flex items-center gap-2 px-5 py-2.5"
              style={{ backgroundColor: '#FFF5F5', borderBottom: '1px solid #FECACA' }}
            >
              <AlertTriangle size={13} style={{ color: '#991B1B' }} />
              <span className="font-montserrat text-xs font-semibold uppercase tracking-wide"
                style={{ color: '#991B1B' }}>
                Vencidas ({vencidas.length})
              </span>
            </div>
            <div className="divide-y max-h-56 overflow-y-auto" style={{ '--tw-divide-color': '#F0EBE0' } as React.CSSProperties}>
              {loadingTarefas ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-5 py-3 space-y-1.5">
                    <div className="h-3.5 rounded w-3/4 animate-pulse" style={{ backgroundColor: '#E2D9C8' }} />
                    <div className="h-3 rounded w-1/2 animate-pulse" style={{ backgroundColor: '#F0EBE0' }} />
                  </div>
                ))
              ) : vencidas.length === 0 ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <CheckCircle2 size={18} style={{ color: '#2D6A4F', opacity: 0.5 }} />
                  <p className="font-lato text-xs" style={{ color: '#9B9B9B' }}>Sem tarefas vencidas</p>
                </div>
              ) : (
                vencidas.map(t => (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/cobranca/casos/${t.caso_id}`)}
                    className="w-full text-left px-5 py-3 hover:bg-red-50 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-lato text-sm truncate flex-1" style={{ color: '#1A1A1A' }}>
                        {t.descricao}
                      </p>
                      <PrioridadeBadge prioridade={t.prioridade} />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {t.devedor_nome && (
                        <span className="font-lato text-[11px] truncate" style={{ color: '#6B6B6B' }}>
                          {t.devedor_nome}
                        </span>
                      )}
                      <span className="font-montserrat text-[10px] font-semibold flex items-center gap-0.5"
                        style={{ color: '#991B1B' }}>
                        <Calendar size={9} />
                        {format(parseISO(t.prazo), 'dd/MM', { locale: ptBR })}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Para hoje */}
          <div>
            <div
              className="flex items-center gap-2 px-5 py-2.5"
              style={{ backgroundColor: '#FFFBEB', borderBottom: '1px solid #FCD34D' }}
            >
              <Clock size={13} style={{ color: '#92400E' }} />
              <span className="font-montserrat text-xs font-semibold uppercase tracking-wide"
                style={{ color: '#92400E' }}>
                Para hoje ({hoje.length})
              </span>
            </div>
            <div className="divide-y max-h-56 overflow-y-auto" style={{ '--tw-divide-color': '#F0EBE0' } as React.CSSProperties}>
              {loadingTarefas ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-5 py-3 space-y-1.5">
                    <div className="h-3.5 rounded w-3/4 animate-pulse" style={{ backgroundColor: '#E2D9C8' }} />
                    <div className="h-3 rounded w-1/2 animate-pulse" style={{ backgroundColor: '#F0EBE0' }} />
                  </div>
                ))
              ) : hoje.length === 0 ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <CheckCircle2 size={18} style={{ color: '#2D6A4F', opacity: 0.5 }} />
                  <p className="font-lato text-xs" style={{ color: '#9B9B9B' }}>Sem tarefas para hoje</p>
                </div>
              ) : (
                hoje.map(t => (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/cobranca/casos/${t.caso_id}`)}
                    className="w-full text-left px-5 py-3 hover:bg-yellow-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-lato text-sm truncate flex-1" style={{ color: '#1A1A1A' }}>
                        {t.descricao}
                      </p>
                      <PrioridadeBadge prioridade={t.prioridade} />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {t.devedor_nome && (
                        <span className="font-lato text-[11px] truncate" style={{ color: '#6B6B6B' }}>
                          {t.devedor_nome}
                        </span>
                      )}
                      <span className="font-montserrat text-[10px] font-semibold"
                        style={{ color: '#92400E' }}>
                        Hoje
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Rodapé informativo ──────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 rounded text-xs font-lato"
        style={{ backgroundColor: '#F0EBE0', color: '#9B9B9B', border: '1px solid #E2D9C8' }}
      >
        <Scale size={12} style={{ color: '#B79A5A', flexShrink: 0 }} />
        <span>
          Alertas de prescrição calculados conforme Arts. 205 e 206, §5º, I do Código Civil.
          Reconhecimento da dívida pelo devedor (Art. 202, VI, CC) interrompe e reinicia o prazo.
        </span>
      </div>
    </div>
  )
}
