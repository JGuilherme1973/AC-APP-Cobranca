/**
 * ListaCasos — Tabela paginada de casos com filtros, ordenação e ações por linha.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInDays, parseISO, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Search, X, ChevronUp, ChevronDown, ChevronsUpDown,
  Plus, Download, Eye, CalendarClock, ArrowRightLeft,
  Archive, Loader2, FolderOpen, ChevronLeft, ChevronRight,
  AlertTriangle,
} from 'lucide-react'

import { useListaCasos } from '@/hooks/cobranca/useListaCasos'
import type { CasoLista } from '@/hooks/cobranca/useListaCasos'
import { formatarMoeda } from '@/lib/utils'

// ââ Constantes ââââââââââââââââââââââââââââââââââââââââââââââââ
const POR_PAGINA = 20

const ETAPA_LABEL: Record<string, string> = {
  DIAGNOSTICO:             'Diagnóstico',
  ESTRATEGIA:              'Estratégia',
  COBRANCA_EXTRAJUDICIAL:  'Cob. Extrajudicial',
  ACAO_JUDICIAL:           'Ação Judicial',
  EXECUCAO_RECUPERACAO:    'Execução',
}

const ETAPA_COR: Record<string, { bg: string; text: string }> = {
  DIAGNOSTICO:            { bg: '#EFF6FF', text: '#1D4ED8' },
  ESTRATEGIA:             { bg: '#F5F3FF', text: '#6D28D9' },
  COBRANCA_EXTRAJUDICIAL: { bg: '#FEF3C7', text: '#92400E' },
  ACAO_JUDICIAL:          { bg: '#FEE2E2', text: '#991B1B' },
  EXECUCAO_RECUPERACAO:   { bg: '#DCFCE7', text: '#166534' },
}

const ETAPAS_LISTA = [
  'DIAGNOSTICO',
  'ESTRATEGIA',
  'COBRANCA_EXTRAJUDICIAL',
  'ACAO_JUDICIAL',
  'EXECUCAO_RECUPERACAO',
]

const TIPOS_EVENTO = [
  'COMUNICACAO_ENVIADA',
  'RESPOSTA_RECEBIDA',
  'PAGAMENTO_PARCIAL',
  'DISTRIBUICAO_ACAO',
  'DECISAO_JUDICIAL',
  'PENHORA_EFETIVADA',
  'ACORDO_FECHADO',
  'OUTRO',
]

const TIPO_EVENTO_LABEL: Record<string, string> = {
  COMUNICACAO_ENVIADA: 'Comunicação Enviada',
  RESPOSTA_RECEBIDA:   'Resposta Recebida',
  PAGAMENTO_PARCIAL:   'Pagamento Parcial',
  DISTRIBUICAO_ACAO:   'Distribuição de Ação',
  DECISAO_JUDICIAL:    'Decisão Judicial',
  PENHORA_EFETIVADA:   'Penhora Efetivada',
  ACORDO_FECHADO:      'Acordo Fechado',
  OUTRO:               'Outro',
}

// ââ Helpers âââââââââââââââââââââââââââââââââââââââââââââââââââ
function diasRestantes(dataLimite: string): number {
  if (!dataLimite) return 9999
  return differenceInDays(parseISO(dataLimite), new Date())
}

type FaixaPresciricao = 'ok' | 'atencao' | 'urgente' | 'prescrito'

function faixaPrescricao(dias: number): FaixaPresciricao {
  if (dias <= 0)  return 'prescrito'
  if (dias <= 30) return 'urgente'
  if (dias <= 90) return 'atencao'
  return 'ok'
}

function exportarCSV(casos: CasoLista[]) {
  const cabecalho = [
    'ID', 'Devedor', 'Tipo Devedor', 'Credor', 'Valor Atualizado',
    'Etapa', 'Prescrição (dias)', 'Advogado', 'Data Abertura',
  ]
  const linhas = casos.map(c => [
    c.id.slice(0, 8),
    c.devedor_nome,
    c.devedor_tipo,
    c.credor_nome,
    c.valor_atualizado.toFixed(2).replace('.', ','),
    ETAPA_LABEL[c.etapa_atual] ?? c.etapa_atual,
    String(diasRestantes(c.data_limite_ajuizamento)),
    c.advogado_nome ?? '',
    format(parseISO(c.data_abertura), 'dd/MM/yyyy'),
  ])
  const csv = [cabecalho, ...linhas]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['ï»¿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = `casos-${format(new Date(), 'yyyy-MM-dd')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ââ Sub-componentes âââââââââââââââââââââââââââââââââââââââââââ

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 9 }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div
            className="h-3 rounded animate-pulse"
            style={{
              backgroundColor: '#E2D9C8',
              width: i === 0 ? '40px' : i === 4 ? '80px' : '100%',
            }}
          />
        </td>
      ))}
    </tr>
  )
}

function BadgePrescricao({ dias }: { dias: number }) {
  const faixa = faixaPrescricao(dias)
  const cfg = {
    ok:       { bg: '#DCFCE7', text: '#166534', label: `${dias}d` },
    atencao:  { bg: '#FEF9C3', text: '#854D0E', label: `${dias}d` },
    urgente:  { bg: '#FEE2E2', text: '#991B1B', label: `${dias}d` },
    prescrito:{ bg: '#1F2937', text: '#F9FAFB', label: 'Prescrito' },
  }[faixa]

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-montserrat font-semibold whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {faixa === 'urgente' && <AlertTriangle size={10} className="mr-1 flex-shrink-0" />}
      {cfg.label}
    </span>
  )
}

function BadgeEtapa({ etapa }: { etapa: string }) {
  const cor = ETAPA_COR[etapa] ?? { bg: '#F3F4F6', text: '#374151' }
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded text-[10px] font-montserrat font-semibold uppercase tracking-wide whitespace-nowrap"
      style={{ backgroundColor: cor.bg, color: cor.text }}
    >
      {ETAPA_LABEL[etapa] ?? etapa}
    </span>
  )
}

function BadgeTipo({ tipo }: { tipo: string }) {
  return (
    <span
      className="ml-1.5 inline-flex px-1 py-0.5 rounded text-[9px] font-montserrat font-bold uppercase"
      style={{ backgroundColor: tipo === 'PJ' ? '#EFF6FF' : '#F5F3FF', color: tipo === 'PJ' ? '#1D4ED8' : '#6D28D9' }}
    >
      {tipo}
    </span>
  )
}

// Ãcone de ordenação na coluna
function SortIcon({ ativo, dir }: { ativo: boolean; dir: 'asc' | 'desc' }) {
  if (!ativo) return <ChevronsUpDown size={12} style={{ color: '#C0C0C0' }} />
  if (dir === 'asc') return <ChevronUp size={12} style={{ color: '#B79A5A' }} />
  return <ChevronDown size={12} style={{ color: '#B79A5A' }} />
}

// Modal base reutilizável
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-2xl p-6"
        style={{ backgroundColor: '#FFFFFF' }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// ââ Tipos de filtros e ordenação ââââââââââââââââââââââââââââââ
type SortKey = 'id' | 'devedor_nome' | 'credor_nome' | 'valor_atualizado' | 'etapa_atual' | 'dias' | 'advogado_nome' | 'data_abertura'
type SortDir = 'asc' | 'desc'

type ModalAberto =
  | { tipo: 'evento';   casoId: string; devedorNome: string }
  | { tipo: 'etapa';    casoId: string; etapaAtual: string }
  | { tipo: 'arquivar'; casoId: string; devedorNome: string }
  | null

// ââ Componente principal ââââââââââââââââââââââââââââââââââââââ
export default function ListaCasos() {
  const navigate = useNavigate()
  const { casos, advogados, loading, error, refetch, arquivarCaso, alterarEtapa, registrarEvento } = useListaCasos()

  // ââ Filtros ââââââââââââââââââââââââââââââââââââââââââââââââ
  const [textoBusca,     setTextoBusca]     = useState('')
  const [textoDebounced, setTextoDebounced] = useState('')
  const [filtroEtapa,    setFiltroEtapa]    = useState('')
  const [filtroPresc,    setFiltroPresc]    = useState('')
  const [filtroAdv,      setFiltroAdv]      = useState('')
  const [valorMin,       setValorMin]       = useState('')
  const [valorMax,       setValorMax]       = useState('')

  // ââ Ordenação e paginação ââââââââââââââââââââââââââââââââââ
  const [sortKey,   setSortKey]   = useState<SortKey>('data_abertura')
  const [sortDir,   setSortDir]   = useState<SortDir>('desc')
  const [pagina,    setPagina]    = useState(1)

  // ââ Modais de ação por linha âââââââââââââââââââââââââââââââ
  const [modalAberto, setModalAberto] = useState<ModalAberto>(null)
  const [eventoTipo,  setEventoTipo]  = useState('OUTRO')
  const [eventoDesc,  setEventoDesc]  = useState('')
  const [novaEtapa,   setNovaEtapa]   = useState('')
  const [salvando,    setSalvando]    = useState(false)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce na busca de texto
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setTextoDebounced(textoBusca), 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [textoBusca])

  // Resetar página ao mudar filtros
  useEffect(() => { setPagina(1) }, [textoDebounced, filtroEtapa, filtroPresc, filtroAdv, valorMin, valorMax])

  // ââ Filtragem + ordenação ââââââââââââââââââââââââââââââââââ
  const casosFiltrados = useMemo(() => {
    let lista = [...casos]

    // Texto
    if (textoDebounced.trim()) {
      const q = textoDebounced.toLowerCase()
      lista = lista.filter(c =>
        c.devedor_nome.toLowerCase().includes(q) ||
        c.credor_nome.toLowerCase().includes(q),
      )
    }

    // Etapa
    if (filtroEtapa) lista = lista.filter(c => c.etapa_atual === filtroEtapa)

    // Advogado
    if (filtroAdv) lista = lista.filter(c => c.advogado_id === filtroAdv)

    // Valor mínimo
    if (valorMin !== '') {
      const min = parseFloat(valorMin.replace(/\./g, '').replace(',', '.'))
      if (!isNaN(min)) lista = lista.filter(c => c.valor_atualizado >= min)
    }

    // Valor máximo
    if (valorMax !== '') {
      const max = parseFloat(valorMax.replace(/\./g, '').replace(',', '.'))
      if (!isNaN(max)) lista = lista.filter(c => c.valor_atualizado <= max)
    }

    // Prescrição
    if (filtroPresc) {
      lista = lista.filter(c => {
        const dias = diasRestantes(c.data_limite_ajuizamento)
        if (filtroPresc === 'ok')       return dias > 90
        if (filtroPresc === 'atencao')  return dias > 30 && dias <= 90
        if (filtroPresc === 'urgente')  return dias > 0  && dias <= 30
        if (filtroPresc === 'prescrito') return dias <= 0
        return true
      })
    }

    // Ordenação
    lista.sort((a, b) => {
      let va: string | number = ''
      let vb: string | number = ''

      if (sortKey === 'dias') {
        va = diasRestantes(a.data_limite_ajuizamento)
        vb = diasRestantes(b.data_limite_ajuizamento)
      } else if (sortKey === 'valor_atualizado') {
        va = a.valor_atualizado
        vb = b.valor_atualizado
      } else {
        va = (a[sortKey] ?? '') as string
        vb = (b[sortKey] ?? '') as string
      }

      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb), 'pt-BR')
        : String(vb).localeCompare(String(va), 'pt-BR')
    })

    return lista
  }, [casos, textoDebounced, filtroEtapa, filtroPresc, filtroAdv, valorMin, valorMax, sortKey, sortDir])

  const totalPaginas = Math.max(1, Math.ceil(casosFiltrados.length / POR_PAGINA))
  const paginaAtual  = Math.min(pagina, totalPaginas)
  const inicio       = (paginaAtual - 1) * POR_PAGINA
  const casosPagina  = casosFiltrados.slice(inicio, inicio + POR_PAGINA)

  const temFiltro = textoDebounced || filtroEtapa || filtroPresc || filtroAdv || valorMin || valorMax

  function limparFiltros() {
    setTextoBusca('')
    setFiltroEtapa('')
    setFiltroPresc('')
    setFiltroAdv('')
    setValorMin('')
    setValorMax('')
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // ââ Ações por linha ââââââââââââââââââââââââââââââââââââââââ
  async function handleSalvarEvento() {
    if (!modalAberto || modalAberto.tipo !== 'evento') return
    if (!eventoDesc.trim()) return
    setSalvando(true)
    await registrarEvento(modalAberto.casoId, eventoTipo, eventoDesc.trim())
    setSalvando(false)
    setModalAberto(null)
    setEventoTipo('OUTRO')
    setEventoDesc('')
  }

  async function handleSalvarEtapa() {
    if (!modalAberto || modalAberto.tipo !== 'etapa' || !novaEtapa) return
    setSalvando(true)
    await alterarEtapa(modalAberto.casoId, novaEtapa)
    setSalvando(false)
    setModalAberto(null)
    setNovaEtapa('')
  }

  async function handleArquivar() {
    if (!modalAberto || modalAberto.tipo !== 'arquivar') return
    setSalvando(true)
    await arquivarCaso(modalAberto.casoId)
    setSalvando(false)
    setModalAberto(null)
  }

  // ââ Cabeçalho da coluna clicável ââââââââââââââââââââââââââ
  function Th({
    label, sortable, colKey, className = '',
  }: { label: string; sortable?: boolean; colKey?: SortKey; className?: string }) {
    return (
      <th
        className={`px-3 py-3 text-left text-[10px] font-montserrat font-semibold uppercase tracking-wider whitespace-nowrap select-none ${sortable ? 'cursor-pointer hover:bg-opacity-80' : ''} ${className}`}
        style={{ color: '#9B9B9B', backgroundColor: '#F9F8F6', borderBottom: '1px solid #E2D9C8' }}
        onClick={sortable && colKey ? () => toggleSort(colKey) : undefined}
      >
        <span className="flex items-center gap-1">
          {label}
          {sortable && colKey && <SortIcon ativo={sortKey === colKey} dir={sortDir} />}
        </span>
      </th>
    )
  }

  // ââ Render ââââââââââââââââââââââââââââââââââââââââââââââââ
  return (
    <div className="flex flex-col h-full gap-4">

      {/* Cabeçalho da página */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-cinzel text-2xl font-bold" style={{ color: '#5A1220' }}>
            Casos
          </h1>
          {!loading && (
            <p className="font-lato text-sm mt-0.5" style={{ color: '#9B9B9B' }}>
              {casosFiltrados.length === casos.length
                ? `${casos.length} caso${casos.length !== 1 ? 's' : ''} no total`
                : `${casosFiltrados.length} de ${casos.length} caso${casos.length !== 1 ? 's' : ''} encontrado${casosFiltrados.length !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportarCSV(casosFiltrados)}
            disabled={loading || casosFiltrados.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-montserrat font-semibold transition-colors disabled:opacity-40"
            style={{ backgroundColor: '#F0EBE0', color: '#5A1220', border: '1px solid #E2D9C8' }}
          >
            <Download size={15} />
            Exportar CSV
          </button>
          <button
            onClick={() => navigate('/cobranca/novo-caso')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-montserrat font-semibold transition-colors"
            style={{ backgroundColor: '#5A1220', color: '#FFFFFF' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#7A2E3E')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#5A1220')}
          >
            <Plus size={15} />
            Novo Caso
          </button>
        </div>
      </div>

      {/* Barra de filtros */}
      <div
        className="rounded-xl p-4 flex flex-wrap gap-3"
        style={{ backgroundColor: '#FAFAF8', border: '1px solid #E2D9C8' }}
      >
        {/* Busca por texto */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#C0C0C0' }} />
          <input
            type="text"
            placeholder="Buscar devedor ou credor..."
            value={textoBusca}
            onChange={e => setTextoBusca(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm font-lato outline-none"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2D9C8',
              color: '#1A1A1A',
            }}
          />
          {textoBusca && (
            <button
              onClick={() => setTextoBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X size={12} style={{ color: '#C0C0C0' }} />
            </button>
          )}
        </div>

        {/* Etapa */}
        <select
          value={filtroEtapa}
          onChange={e => setFiltroEtapa(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm font-lato outline-none"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2D9C8', color: '#1A1A1A', minWidth: '160px' }}
        >
          <option value="">Todas as etapas</option>
          {ETAPAS_LISTA.map(e => (
            <option key={e} value={e}>{ETAPA_LABEL[e]}</option>
          ))}
        </select>

        {/* Prescrição */}
        <select
          value={filtroPresc}
          onChange={e => setFiltroPresc(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm font-lato outline-none"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2D9C8', color: '#1A1A1A', minWidth: '160px' }}
        >
          <option value="">Todas prescrições</option>
          <option value="ok">OK (&gt; 90 dias)</option>
          <option value="atencao">Atenção (&lt; 90 dias)</option>
          <option value="urgente">Urgente (&lt; 30 dias)</option>
          <option value="prescrito">Prescrito</option>
        </select>

        {/* Advogado */}
        <select
          value={filtroAdv}
          onChange={e => setFiltroAdv(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm font-lato outline-none"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2D9C8', color: '#1A1A1A', minWidth: '160px' }}
        >
          <option value="">Todos advogados</option>
          {advogados.map(a => (
            <option key={a.id} value={a.id}>{a.nome}</option>
          ))}
        </select>

        {/* Valor mín */}
        <input
          type="text"
          placeholder="Valor mín (R$)"
          value={valorMin}
          onChange={e => setValorMin(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm font-lato outline-none w-32"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2D9C8', color: '#1A1A1A' }}
        />

        {/* Valor máx */}
        <input
          type="text"
          placeholder="Valor máx (R$)"
          value={valorMax}
          onChange={e => setValorMax(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm font-lato outline-none w-32"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2D9C8', color: '#1A1A1A' }}
        />

        {/* Limpar filtros */}
        {temFiltro && (
          <button
            onClick={limparFiltros}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-montserrat font-semibold transition-colors"
            style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}
          >
            <X size={13} />
            Limpar filtros
          </button>
        )}
      </div>

      {/* Tabela */}
      <div
        className="flex-1 rounded-xl overflow-hidden"
        style={{ border: '1px solid #E2D9C8', backgroundColor: '#FFFFFF' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: '960px' }}>
            <thead>
              <tr>
                <Th label="#"          sortable colKey="id"               className="w-16" />
                <Th label="Devedor"    sortable colKey="devedor_nome"      className="min-w-[160px]" />
                <Th label="Credor"     sortable colKey="credor_nome"       className="min-w-[140px]" />
                <Th label="Valor"      sortable colKey="valor_atualizado"  className="min-w-[110px]" />
                <Th label="Etapa"      sortable colKey="etapa_atual"       className="min-w-[140px]" />
                <Th label="Prescrição" sortable colKey="dias"              className="min-w-[110px]" />
                <Th label="Advogado"   sortable colKey="advogado_nome"     className="min-w-[130px]" />
                <Th label="Abertura"   sortable colKey="data_abertura"     className="min-w-[95px]" />
                <Th label="Ações"      className="w-28 text-right" />
              </tr>
            </thead>

            <tbody>
              {loading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

              {!loading && error && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center">
                    <p className="font-lato text-sm" style={{ color: '#991B1B' }}>{error}</p>
                    <button
                      onClick={() => void refetch()}
                      className="mt-3 font-montserrat text-sm font-semibold underline"
                      style={{ color: '#5A1220' }}
                    >
                      Tentar novamente
                    </button>
                  </td>
                </tr>
              )}

              {!loading && !error && casosPagina.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <FolderOpen size={40} className="mx-auto mb-3" style={{ color: '#C0C0C0' }} />
                    <p className="font-cinzel font-bold text-base" style={{ color: '#5A1220' }}>
                      {temFiltro ? 'Nenhum caso encontrado' : 'Nenhum caso cadastrado'}
                    </p>
                    <p className="font-lato text-sm mt-1 mb-4" style={{ color: '#9B9B9B' }}>
                      {temFiltro
                        ? 'Ajuste os filtros para ver mais resultados.'
                        : 'Comece registrando o primeiro caso de cobrança.'}
                    </p>
                    {!temFiltro && (
                      <button
                        onClick={() => navigate('/cobranca/novo-caso')}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-montserrat font-semibold"
                        style={{ backgroundColor: '#5A1220', color: '#FFFFFF' }}
                      >
                        <Plus size={14} />
                        Novo Caso
                      </button>
                    )}
                    {temFiltro && (
                      <button
                        onClick={limparFiltros}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-montserrat font-semibold"
                        style={{ backgroundColor: '#F0EBE0', color: '#5A1220', border: '1px solid #E2D9C8' }}
                      >
                        <X size={14} />
                        Limpar filtros
                      </button>
                    )}
                  </td>
                </tr>
              )}

              {!loading && !error && casosPagina.map((caso, idx) => {
                const dias       = diasRestantes(caso.data_limite_ajuizamento)
                const urgente    = dias <= 30
                const shortId    = caso.id.slice(0, 8).toUpperCase()

                return (
                  <tr
                    key={caso.id}
                    className="group cursor-pointer transition-colors"
                    style={{
                      backgroundColor: urgente
                        ? (idx % 2 === 0 ? '#FFF5F5' : '#FFF0F0')
                        : (idx % 2 === 0 ? '#FFFFFF' : '#FAFAF8'),
                      borderBottom: '1px solid #F0EBE0',
                    }}
                    onMouseEnter={e => { if (!urgente) e.currentTarget.style.backgroundColor = '#F5F0E8' }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = urgente
                        ? (idx % 2 === 0 ? '#FFF5F5' : '#FFF0F0')
                        : (idx % 2 === 0 ? '#FFFFFF' : '#FAFAF8')
                    }}
                    onClick={() => navigate(`/cobranca/casos/${caso.id}`)}
                  >
                    {/* # */}
                    <td className="px-3 py-3">
                      <span
                        className="font-montserrat text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: '#F0EBE0', color: '#9B9B9B', fontFamily: 'monospace' }}
                      >
                        {shortId}
                      </span>
                    </td>

                    {/* Devedor */}
                    <td className="px-3 py-3">
                      <div className="flex items-center">
                        <span
                          className="font-lato text-sm font-semibold truncate max-w-[180px]"
                          style={{ color: '#1A1A1A' }}
                          title={caso.devedor_nome}
                        >
                          {caso.devedor_nome}
                        </span>
                        <BadgeTipo tipo={caso.devedor_tipo} />
                      </div>
                    </td>

                    {/* Credor */}
                    <td className="px-3 py-3">
                      <span
                        className="font-lato text-sm truncate block max-w-[160px]"
                        style={{ color: '#4B5563' }}
                        title={caso.credor_nome}
                      >
                        {caso.credor_nome}
                      </span>
                    </td>

                    {/* Valor */}
                    <td className="px-3 py-3">
                      <span className="font-montserrat text-sm font-semibold" style={{ color: '#5A1220' }}>
                        {formatarMoeda(caso.valor_atualizado)}
                      </span>
                    </td>

                    {/* Etapa */}
                    <td className="px-3 py-3">
                      <BadgeEtapa etapa={caso.etapa_atual} />
                    </td>

                    {/* Prescrição */}
                    <td className="px-3 py-3">
                      <BadgePrescricao dias={dias} />
                    </td>

                    {/* Advogado */}
                    <td className="px-3 py-3">
                      <span
                        className="font-lato text-sm truncate block max-w-[140px]"
                        style={{ color: '#4B5563' }}
                        title={caso.advogado_nome ?? '—'}
                      >
                        {caso.advogado_nome
                          ? caso.advogado_nome.split(' ').slice(0, 2).join(' ')
                          : <span style={{ color: '#C0C0C0' }}>—</span>}
                      </span>
                    </td>

                    {/* Data abertura */}
                    <td className="px-3 py-3">
                      <span className="font-lato text-sm" style={{ color: '#6B7280' }}>
                        {format(parseISO(caso.data_abertura), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                    </td>

                    {/* Ações */}
                    <td
                      className="px-3 py-3"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          title="Ver ficha"
                          className="p-1.5 rounded transition-colors"
                          style={{ color: '#6B7280' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F0EBE0')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          onClick={() => navigate(`/cobranca/casos/${caso.id}`)}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          title="Registrar evento"
                          className="p-1.5 rounded transition-colors"
                          style={{ color: '#6B7280' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F0EBE0')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          onClick={() => setModalAberto({ tipo: 'evento', casoId: caso.id, devedorNome: caso.devedor_nome })}
                        >
                          <CalendarClock size={14} />
                        </button>
                        <button
                          title="Alterar etapa"
                          className="p-1.5 rounded transition-colors"
                          style={{ color: '#6B7280' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F0EBE0')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          onClick={() => { setNovaEtapa(caso.etapa_atual); setModalAberto({ tipo: 'etapa', casoId: caso.id, etapaAtual: caso.etapa_atual }) }}
                        >
                          <ArrowRightLeft size={14} />
                        </button>
                        <button
                          title="Arquivar caso"
                          className="p-1.5 rounded transition-colors"
                          style={{ color: '#6B7280' }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#FEE2E2'; e.currentTarget.style.color = '#991B1B' }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6B7280' }}
                          onClick={() => setModalAberto({ tipo: 'arquivar', casoId: caso.id, devedorNome: caso.devedor_nome })}
                        >
                          <Archive size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {!loading && !error && casosFiltrados.length > POR_PAGINA && (
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: '1px solid #E2D9C8', backgroundColor: '#F9F8F6' }}
          >
            <p className="font-lato text-sm" style={{ color: '#9B9B9B' }}>
              Página {paginaAtual} de {totalPaginas}
              {' Â· '}
              {inicio + 1}â{Math.min(inicio + POR_PAGINA, casosFiltrados.length)} de {casosFiltrados.length}
            </p>

            <div className="flex items-center gap-2">
              <button
                disabled={paginaAtual === 1}
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-montserrat font-semibold disabled:opacity-40 transition-colors"
                style={{ backgroundColor: '#F0EBE0', color: '#5A1220', border: '1px solid #E2D9C8' }}
              >
                <ChevronLeft size={14} />
                Anterior
              </button>

              {/* Páginas ao redor da atual */}
              <div className="flex gap-1">
                {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPaginas || Math.abs(p - paginaAtual) <= 1)
                  .reduce<(number | '...')[]>((acc, p, i, arr) => {
                    if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, i) =>
                    p === '...'
                      ? <span key={`e${i}`} className="px-2 py-1 text-sm" style={{ color: '#C0C0C0' }}>â¦</span>
                      : (
                        <button
                          key={p}
                          onClick={() => setPagina(p as number)}
                          className="w-8 h-8 rounded-lg text-sm font-montserrat font-semibold transition-colors"
                          style={{
                            backgroundColor: paginaAtual === p ? '#5A1220' : 'transparent',
                            color: paginaAtual === p ? '#FFFFFF' : '#6B7280',
                          }}
                        >
                          {p}
                        </button>
                      ),
                  )}
              </div>

              <button
                disabled={paginaAtual === totalPaginas}
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-montserrat font-semibold disabled:opacity-40 transition-colors"
                style={{ backgroundColor: '#F0EBE0', color: '#5A1220', border: '1px solid #E2D9C8' }}
              >
                Próxima
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ââ Modais de ação por linha ââ */}

      {/* Modal: Registrar evento rápido */}
      {modalAberto?.tipo === 'evento' && (
        <Modal onClose={() => setModalAberto(null)}>
          <h3 className="font-cinzel font-bold text-base mb-1" style={{ color: '#5A1220' }}>
            Registrar Evento
          </h3>
          <p className="font-lato text-xs mb-4" style={{ color: '#9B9B9B' }}>
            {modalAberto.devedorNome}
          </p>

          <label className="block text-xs font-montserrat font-semibold uppercase mb-1" style={{ color: '#9B9B9B' }}>
            Tipo de evento
          </label>
          <select
            value={eventoTipo}
            onChange={e => setEventoTipo(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm font-lato mb-3 outline-none"
            style={{ backgroundColor: '#F9F8F6', border: '1px solid #E2D9C8', color: '#1A1A1A' }}
          >
            {TIPOS_EVENTO.map(t => (
              <option key={t} value={t}>{TIPO_EVENTO_LABEL[t]}</option>
            ))}
          </select>

          <label className="block text-xs font-montserrat font-semibold uppercase mb-1" style={{ color: '#9B9B9B' }}>
            Descrição
          </label>
          <textarea
            value={eventoDesc}
            onChange={e => setEventoDesc(e.target.value)}
            rows={3}
            placeholder="Descreva o evento..."
            className="w-full px-3 py-2 rounded-lg text-sm font-lato outline-none resize-none mb-4"
            style={{ backgroundColor: '#F9F8F6', border: '1px solid #E2D9C8', color: '#1A1A1A' }}
          />

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setModalAberto(null)}
              className="px-4 py-2 rounded-lg text-sm font-montserrat font-semibold"
              style={{ backgroundColor: '#F0EBE0', color: '#5A1220' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleSalvarEvento()}
              disabled={!eventoDesc.trim() || salvando}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-montserrat font-semibold disabled:opacity-50"
              style={{ backgroundColor: '#5A1220', color: '#FFFFFF' }}
            >
              {salvando && <Loader2 size={13} className="animate-spin" />}
              Registrar
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Alterar etapa */}
      {modalAberto?.tipo === 'etapa' && (
        <Modal onClose={() => setModalAberto(null)}>
          <h3 className="font-cinzel font-bold text-base mb-4" style={{ color: '#5A1220' }}>
            Alterar Etapa
          </h3>

          <div className="flex flex-col gap-2 mb-5">
            {ETAPAS_LISTA.map(e => {
              const cor = ETAPA_COR[e] ?? { bg: '#F3F4F6', text: '#374151' }
              const selecionada = novaEtapa === e
              return (
                <button
                  key={e}
                  onClick={() => setNovaEtapa(e)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-lato text-left transition-all"
                  style={{
                    backgroundColor: selecionada ? cor.bg : '#F9F8F6',
                    border: selecionada ? `2px solid ${cor.text}` : '2px solid transparent',
                    color: selecionada ? cor.text : '#4B5563',
                    fontWeight: selecionada ? 600 : 400,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cor.text }}
                  />
                  {ETAPA_LABEL[e]}
                </button>
              )
            })}
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setModalAberto(null)}
              className="px-4 py-2 rounded-lg text-sm font-montserrat font-semibold"
              style={{ backgroundColor: '#F0EBE0', color: '#5A1220' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleSalvarEtapa()}
              disabled={!novaEtapa || novaEtapa === modalAberto.etapaAtual || salvando}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-montserrat font-semibold disabled:opacity-50"
              style={{ backgroundColor: '#5A1220', color: '#FFFFFF' }}
            >
              {salvando && <Loader2 size={13} className="animate-spin" />}
              Confirmar
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Arquivar caso */}
      {modalAberto?.tipo === 'arquivar' && (
        <Modal onClose={() => setModalAberto(null)}>
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: '#FEE2E2' }}
          >
            <Archive size={22} style={{ color: '#991B1B' }} />
          </div>
          <h3 className="font-cinzel font-bold text-base text-center mb-2" style={{ color: '#1A1A1A' }}>
            Arquivar Caso
          </h3>
          <p className="font-lato text-sm text-center mb-5" style={{ color: '#6B7280' }}>
            Tem certeza que deseja arquivar o caso de{' '}
            <strong style={{ color: '#1A1A1A' }}>{modalAberto.devedorNome}</strong>?{' '}
            O caso será removido da listagem ativa.
          </p>

          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setModalAberto(null)}
              className="px-5 py-2 rounded-lg text-sm font-montserrat font-semibold"
              style={{ backgroundColor: '#F0EBE0', color: '#5A1220' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleArquivar()}
              disabled={salvando}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-montserrat font-semibold disabled:opacity-50"
              style={{ backgroundColor: '#991B1B', color: '#FFFFFF' }}
            >
              {salvando && <Loader2 size={13} className="animate-spin" />}
              Arquivar
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
