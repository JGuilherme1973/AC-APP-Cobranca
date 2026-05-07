/**
 * PainelLGPD.tsx
 * Painel interno para advogados gerenciarem conformidade LGPD.
 * Exibe consentimentos, solicitações de titulares e métrica de cobertura.
 *
 * Props:
 *   devedor_id — opcional. Se fornecido: exibe dados do devedor específico.
 *               Se omitido: visão global (todos os devedores).
 */

import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  AlertTriangle,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Upload,
  ChevronDown,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ─── Paleta VINDEX ────────────────────────────────────────────
const COR_NAVY = '#0E1B2A'
const COR_OURO = '#B79A5A'
const COR_VINHO = '#5A1220'

// ─── Tipos locais ─────────────────────────────────────────────
interface ConsentimentoRow {
  id: string
  devedor_id: string
  devedor_nome?: string
  tipo_consentimento: string
  canal: string
  base_legal: string
  concedido: boolean
  data_consentimento: string
  revogado_em: string | null
}

interface SolicitacaoRow {
  id: string
  devedor_id: string
  devedor_nome?: string
  tipo_solicitacao: string
  status: string
  prazo_resposta: string | null
  respondido_em: string | null
  descricao: string
  resposta?: string | null
}

type StatusSolicitacao = 'respondida' | 'parcialmente_atendida' | 'negada'

// ─── Props ────────────────────────────────────────────────────
interface Props {
  devedor_id?: string
}

// ─── Utilitários ─────────────────────────────────────────────
function diasRestantes(prazo: string | null): number | null {
  if (!prazo) return null
  const diff = new Date(prazo).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function capitalizarTipo(tipo: string): string {
  return tipo
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Badge de consentimento ───────────────────────────────────
function BadgeConsentimento({
  concedido,
  revogadoEm,
}: {
  concedido: boolean
  revogadoEm: string | null
}) {
  if (revogadoEm) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold font-montserrat"
        style={{ backgroundColor: 'rgba(107,114,128,0.2)', color: '#9CA3AF', border: '1px solid rgba(107,114,128,0.3)' }}>
        <XCircle size={10} /> Revogado
      </span>
    )
  }
  if (!concedido) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold font-montserrat"
        style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)' }}>
        <XCircle size={10} /> Negado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold font-montserrat"
      style={{ backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.3)' }}>
      <CheckCircle2 size={10} /> Ativo
    </span>
  )
}

// ─── Badge de status de solicitação ──────────────────────────
function BadgeStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; cor: string; borda: string }> = {
    aberta: { label: 'Aberta', bg: 'rgba(234,179,8,0.12)', cor: '#FDE047', borda: 'rgba(234,179,8,0.3)' },
    em_analise: { label: 'Em Análise', bg: 'rgba(59,130,246,0.12)', cor: '#93C5FD', borda: 'rgba(59,130,246,0.3)' },
    respondida: { label: 'Respondida', bg: 'rgba(74,222,128,0.12)', cor: '#4ADE80', borda: 'rgba(74,222,128,0.3)' },
    parcialmente_atendida: { label: 'Parcial', bg: 'rgba(249,115,22,0.12)', cor: '#FB923C', borda: 'rgba(249,115,22,0.3)' },
    negada: { label: 'Negada', bg: 'rgba(239,68,68,0.12)', cor: '#F87171', borda: 'rgba(239,68,68,0.3)' },
    arquivada: { label: 'Arquivada', bg: 'rgba(107,114,128,0.12)', cor: '#9CA3AF', borda: 'rgba(107,114,128,0.3)' },
  }
  const s = map[status] ?? map['arquivada']
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold font-montserrat"
      style={{ backgroundColor: s.bg, color: s.cor, border: `1px solid ${s.borda}` }}
    >
      {s.label}
    </span>
  )
}

// ─── Skeleton de linha de tabela ──────────────────────────────
function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 rounded animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.06)', width: `${60 + Math.random() * 30}%` }} />
        </td>
      ))}
    </tr>
  )
}

// ─── Modal: responder solicitação ────────────────────────────
interface ModalResponderProps {
  solicitacao: SolicitacaoRow
  onFechar: () => void
  onSalvo: () => void
}

function ModalResponder({ solicitacao, onFechar, onSalvo }: ModalResponderProps) {
  const [resposta, setResposta] = useState(solicitacao.resposta ?? '')
  const [statusSelecionado, setStatusSelecionado] = useState<StatusSolicitacao>('respondida')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const handleSalvar = async () => {
    if (!resposta.trim()) {
      setErro('A resposta é obrigatória.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const respondidoPor = user?.id ?? null

      const updates: Record<string, unknown> = {
        status: statusSelecionado,
        resposta: resposta.trim(),
        respondido_em: new Date().toISOString(),
        respondido_por: respondidoPor,
      }

      // Upload de arquivo se houver
      if (arquivo) {
        const path = `lgpd/${solicitacao.id}/${Date.now()}_${arquivo.name}`
        const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(path, arquivo, { upsert: false })
        if (uploadError) {
          console.warn('[LGPD] Upload de arquivo falhou:', uploadError.message)
        } else {
          updates['documento_path'] = path
        }
      }

      const { error: updateError } = await supabase
        .from('solicitacoes_titular')
        .update(updates)
        .eq('id', solicitacao.id)

      if (updateError) throw new Error(updateError.message)
      onSalvo()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar resposta.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
    >
      <div
        className="w-full max-w-lg rounded-xl overflow-hidden"
        style={{
          backgroundColor: '#0F1E2E',
          border: `1px solid rgba(183,154,90,0.25)`,
          boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ backgroundColor: COR_NAVY, borderBottom: `2px solid ${COR_OURO}` }}
        >
          <div className="flex items-center gap-2">
            <FileText size={18} style={{ color: COR_OURO }} />
            <span className="font-cinzel font-bold text-sm" style={{ color: COR_OURO }}>
              Responder Solicitação LGPD
            </span>
          </div>
          <button
            onClick={onFechar}
            className="text-sm transition-opacity hover:opacity-60"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Info da solicitação */}
          <div
            className="rounded-lg px-4 py-3 text-sm font-lato"
            style={{ backgroundColor: 'rgba(14,27,42,0.8)', border: '1px solid rgba(183,154,90,0.15)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-white">{capitalizarTipo(solicitacao.tipo_solicitacao)}</span>
              <BadgeStatus status={solicitacao.status} />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.6)' }}>{solicitacao.descricao}</p>
          </div>

          {/* Status selector */}
          <div className="space-y-1">
            <label className="text-xs font-montserrat font-semibold uppercase tracking-wide"
              style={{ color: 'rgba(255,255,255,0.5)' }}>
              Novo Status
            </label>
            <div className="relative">
              <select
                value={statusSelecionado}
                onChange={e => setStatusSelecionado(e.target.value as StatusSolicitacao)}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-lato outline-none appearance-none"
                style={{
                  backgroundColor: 'rgba(14,27,42,0.85)',
                  border: '1px solid rgba(183,154,90,0.3)',
                  color: '#E2E8F0',
                }}
              >
                <option value="respondida">Respondida</option>
                <option value="parcialmente_atendida">Parcialmente Atendida</option>
                <option value="negada">Negada</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'rgba(255,255,255,0.4)' }} />
            </div>
          </div>

          {/* Resposta */}
          <div className="space-y-1">
            <label className="text-xs font-montserrat font-semibold uppercase tracking-wide"
              style={{ color: 'rgba(255,255,255,0.5)' }}>
              Resposta ao Titular <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <textarea
              value={resposta}
              onChange={e => setResposta(e.target.value)}
              rows={5}
              placeholder="Descreva a resposta ao titular conforme a LGPD Art. 18..."
              className="w-full px-4 py-3 rounded-lg text-sm font-lato outline-none resize-none"
              style={{
                backgroundColor: 'rgba(14,27,42,0.85)',
                border: `1px solid ${erro && !resposta.trim() ? '#EF4444' : 'rgba(183,154,90,0.3)'}`,
                color: '#E2E8F0',
              }}
            />
          </div>

          {/* Upload de documento */}
          <div className="space-y-1">
            <label className="text-xs font-montserrat font-semibold uppercase tracking-wide"
              style={{ color: 'rgba(255,255,255,0.5)' }}>
              Documento Anexo (opcional)
            </label>
            <label
              className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all"
              style={{
                backgroundColor: 'rgba(14,27,42,0.6)',
                border: '1px dashed rgba(183,154,90,0.3)',
                color: 'rgba(255,255,255,0.5)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLLabelElement).style.borderColor = COR_OURO }}
              onMouseLeave={e => { (e.currentTarget as HTMLLabelElement).style.borderColor = 'rgba(183,154,90,0.3)' }}
            >
              <Upload size={16} style={{ color: COR_OURO, flexShrink: 0 }} />
              <span className="text-sm font-lato">
                {arquivo ? arquivo.name : 'Clique para selecionar arquivo'}
              </span>
              <input
                type="file"
                className="hidden"
                onChange={e => setArquivo(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {/* Erro */}
          {erro && (
            <div
              className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm font-lato"
              style={{ backgroundColor: 'rgba(90,18,32,0.4)', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }}
            >
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              {erro}
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onFechar}
              className="flex-1 py-2.5 rounded-lg text-sm font-montserrat font-medium transition-all"
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={salvando}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm
                         font-montserrat font-semibold text-white transition-all disabled:opacity-60"
              style={{ backgroundColor: COR_VINHO }}
              onMouseEnter={e => { if (!salvando) (e.currentTarget as HTMLButtonElement).style.backgroundColor = COR_OURO }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = COR_VINHO }}
            >
              {salvando ? (
                <><Loader2 size={14} className="animate-spin" /> Salvando...</>
              ) : (
                <><CheckCircle2 size={14} /> Salvar Resposta</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────
export default function PainelLGPD({ devedor_id }: Props) {
  const [consentimentos, setConsentimentos] = useState<ConsentimentoRow[]>([])
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoRow[]>([])
  const [loadingConsent, setLoadingConsent] = useState(true)
  const [loadingSolic, setLoadingSolic] = useState(true)
  const [cobertura, setCobertura] = useState<{ total: number; comConsent: number } | null>(null)
  const [loadingCobertura, setLoadingCobertura] = useState(true)
  const [solicitacaoSelecionada, setSolicitacaoSelecionada] = useState<SolicitacaoRow | null>(null)
  const [erroConsent, setErroConsent] = useState('')
  const [erroSolic, setErroSolic] = useState('')

  const isGlobal = !devedor_id

  // ── Carregar consentimentos ──────────────────────────────
  const carregarConsentimentos = useCallback(async () => {
    setLoadingConsent(true)
    setErroConsent('')
    try {
      let query = supabase
        .from('consentimentos_lgpd')
        .select('id, devedor_id, tipo_consentimento, canal, base_legal, concedido, data_consentimento, revogado_em, devedores(nome)')
        .order('data_consentimento', { ascending: false })
        .limit(100)

      if (devedor_id) {
        query = query.eq('devedor_id', devedor_id)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)

      const rows: ConsentimentoRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        devedor_id: r.devedor_id as string,
        devedor_nome: (r.devedores as { nome?: string } | null)?.nome,
        tipo_consentimento: r.tipo_consentimento as string,
        canal: r.canal as string,
        base_legal: r.base_legal as string,
        concedido: r.concedido as boolean,
        data_consentimento: r.data_consentimento as string,
        revogado_em: r.revogado_em as string | null,
      }))

      setConsentimentos(rows)
    } catch (e) {
      setErroConsent(e instanceof Error ? e.message : 'Erro ao carregar consentimentos.')
    } finally {
      setLoadingConsent(false)
    }
  }, [devedor_id])

  // ── Carregar solicitações ────────────────────────────────
  const carregarSolicitacoes = useCallback(async () => {
    setLoadingSolic(true)
    setErroSolic('')
    try {
      let query = supabase
        .from('solicitacoes_titular')
        .select('id, devedor_id, tipo_solicitacao, status, prazo_resposta, respondido_em, descricao, resposta, devedores(nome)')
        .order('created_at', { ascending: false })
        .limit(100)

      if (devedor_id) {
        query = query.eq('devedor_id', devedor_id)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)

      const rows: SolicitacaoRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        devedor_id: r.devedor_id as string,
        devedor_nome: (r.devedores as { nome?: string } | null)?.nome,
        tipo_solicitacao: r.tipo_solicitacao as string,
        status: r.status as string,
        prazo_resposta: r.prazo_resposta as string | null,
        respondido_em: r.respondido_em as string | null,
        descricao: r.descricao as string,
        resposta: r.resposta as string | null,
      }))

      setSolicitacoes(rows)
    } catch (e) {
      setErroSolic(e instanceof Error ? e.message : 'Erro ao carregar solicitações.')
    } finally {
      setLoadingSolic(false)
    }
  }, [devedor_id])

  // ── Carregar métrica de cobertura ────────────────────────
  const carregarCobertura = useCallback(async () => {
    setLoadingCobertura(true)
    try {
      let totalQuery = supabase
        .from('comunicacoes')
        .select('*', { count: 'exact', head: true })

      if (devedor_id) {
        totalQuery = totalQuery.eq('devedor_id', devedor_id) as typeof totalQuery
      }

      const { count: total } = await totalQuery

      // Verificar quais devedores têm consentimento ativo
      let consentQuery = supabase
        .from('consentimentos_lgpd')
        .select('devedor_id', { count: 'exact', head: true })
        .eq('concedido', true)
        .is('revogado_em', null)

      if (devedor_id) {
        consentQuery = consentQuery.eq('devedor_id', devedor_id)
      }

      const { count: devedoresComConsent } = await consentQuery

      setCobertura({
        total: total ?? 0,
        comConsent: devedoresComConsent ?? 0,
      })
    } catch {
      setCobertura(null)
    } finally {
      setLoadingCobertura(false)
    }
  }, [devedor_id])

  useEffect(() => {
    carregarConsentimentos()
    carregarSolicitacoes()
    carregarCobertura()
  }, [carregarConsentimentos, carregarSolicitacoes, carregarCobertura])

  // ── Derivados ────────────────────────────────────────────
  const solicitacoesCriticas = solicitacoes.filter(s => {
    const dias = diasRestantes(s.prazo_resposta)
    return s.status === 'aberta' || s.status === 'em_analise'
      ? dias !== null && dias < 3
      : false
  })

  const percentCobertura = cobertura && cobertura.total > 0
    ? Math.round((cobertura.comConsent / cobertura.total) * 100)
    : cobertura?.total === 0
      ? 0
      : null

  const handleSalvoResposta = () => {
    setSolicitacaoSelecionada(null)
    carregarSolicitacoes()
  }

  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-1">
      {/* ── Banner crítico ── */}
      {!loadingSolic && solicitacoesCriticas.length > 0 && (
        <div
          className="flex items-center gap-3 rounded-xl px-5 py-3.5"
          style={{
            backgroundColor: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.5)',
          }}
        >
          <AlertTriangle size={20} style={{ color: '#F87171', flexShrink: 0 }} />
          <p className="text-sm font-montserrat font-semibold" style={{ color: '#FCA5A5' }}>
            ⚠ {solicitacoesCriticas.length} solicitaç{solicitacoesCriticas.length === 1 ? 'ão' : 'ões'} LGPD com prazo crítico (&lt; 3 dias)
          </p>
        </div>
      )}

      {/* ── Métrica de cobertura ── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: '#0F1E2E', border: `1px solid rgba(183,154,90,0.2)` }}
      >
        <div
          className="px-5 py-3 flex items-center gap-2"
          style={{ backgroundColor: COR_NAVY, borderBottom: `1px solid rgba(183,154,90,0.2)` }}
        >
          <ShieldCheck size={16} style={{ color: COR_OURO }} />
          <span className="text-sm font-montserrat font-semibold" style={{ color: COR_OURO }}>
            Cobertura de Consentimentos
          </span>
        </div>
        <div className="px-5 py-4">
          {loadingCobertura ? (
            <div className="h-8 rounded animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
          ) : percentCobertura !== null ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-lato" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Comunicações com consentimento registrado
                </span>
                <span className="font-mono font-bold text-lg" style={{ color: COR_OURO }}>
                  {percentCobertura}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${percentCobertura}%`,
                    backgroundColor: percentCobertura >= 80 ? '#4ADE80' : percentCobertura >= 50 ? COR_OURO : COR_VINHO,
                  }}
                />
              </div>
              <p className="text-xs font-lato" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {cobertura?.comConsent ?? 0} com consentimento ativo de {cobertura?.total ?? 0} comunicações totais
                {isGlobal ? ' (visão global)' : ''}
              </p>
            </div>
          ) : (
            <p className="text-sm font-lato" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Dados insuficientes para calcular cobertura.
            </p>
          )}
        </div>
      </div>

      {/* ── SEÇÃO 1: Consentimentos ── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: '#0F1E2E', border: `1px solid rgba(183,154,90,0.2)` }}
      >
        {/* Header */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ backgroundColor: COR_NAVY, borderBottom: `1px solid rgba(183,154,90,0.2)` }}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} style={{ color: COR_OURO }} />
            <span className="text-sm font-montserrat font-semibold" style={{ color: COR_OURO }}>
              Consentimentos LGPD
            </span>
            {!loadingConsent && (
              <span
                className="px-1.5 py-0.5 rounded text-xs font-mono"
                style={{ backgroundColor: 'rgba(183,154,90,0.15)', color: COR_OURO }}
              >
                {consentimentos.length}
              </span>
            )}
          </div>
          <button
            onClick={carregarConsentimentos}
            disabled={loadingConsent}
            className="p-1.5 rounded transition-opacity hover:opacity-70 disabled:opacity-40"
            title="Atualizar"
          >
            <RefreshCw size={13} style={{ color: 'rgba(255,255,255,0.4)' }} className={loadingConsent ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {isGlobal && (
                  <th className="px-4 py-3 text-left text-xs font-montserrat font-semibold uppercase tracking-wide"
                    style={{ color: 'rgba(255,255,255,0.4)' }}>Devedor</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-montserrat font-semibold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-montserrat font-semibold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Canal</th>
                <th className="px-4 py-3 text-left text-xs font-montserrat font-semibold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Base Legal</th>
                <th className="px-4 py-3 text-left text-xs font-montserrat font-semibold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Status</th>
                <th className="px-4 py-3 text-left text-xs font-montserrat font-semibold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Data</th>
                <th className="px-4 py-3 text-left text-xs font-montserrat font-semibold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Revogado em</th>
              </tr>
            </thead>
            <tbody>
              {loadingConsent ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonRow key={i} cols={isGlobal ? 7 : 6} />
                ))
              ) : erroConsent ? (
                <tr>
                  <td colSpan={isGlobal ? 7 : 6} className="px-4 py-8 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <AlertTriangle size={20} style={{ color: '#F87171' }} />
                      <p className="text-sm font-lato" style={{ color: '#FCA5A5' }}>{erroConsent}</p>
                    </div>
                  </td>
                </tr>
              ) : consentimentos.length === 0 ? (
                <tr>
                  <td colSpan={isGlobal ? 7 : 6} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <ShieldCheck size={28} style={{ color: 'rgba(255,255,255,0.15)' }} />
                      <p className="text-sm font-lato" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Nenhum consentimento registrado.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                consentimentos.map(c => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    className="transition-colors hover:bg-white/[0.02]"
                  >
                    {isGlobal && (
                      <td className="px-4 py-3 font-lato text-xs" style={{ color: '#E2E8F0' }}>
                        {c.devedor_nome ?? c.devedor_id.slice(0, 8) + '…'}
                      </td>
                    )}
                    <td className="px-4 py-3 font-lato text-xs" style={{ color: '#E2E8F0' }}>
                      {capitalizarTipo(c.tipo_consentimento)}
                    </td>
                    <td className="px-4 py-3 font-lato text-xs capitalize" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      {c.canal}
                    </td>
                    <td className="px-4 py-3 font-lato text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {c.base_legal}
                    </td>
                    <td className="px-4 py-3">
                      <BadgeConsentimento concedido={c.concedido} revogadoEm={c.revogado_em} />
                    </td>
                    <td className="px-4 py-3 font-lato text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {formatarData(c.data_consentimento)}
                    </td>
                    <td className="px-4 py-3 font-lato text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {c.revogado_em ? formatarData(c.revogado_em) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SEÇÃO 2: Solicitações dos Titulares ── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: '#0F1E2E', border: `1px solid rgba(183,154,90,0.2)` }}
      >
        {/* Header */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ backgroundColor: COR_NAVY, borderBottom: `1px solid rgba(183,154,90,0.2)` }}
        >
          <div className="flex items-center gap-2">
            <FileText size={16} style={{ color: COR_OURO }} />
            <span className="text-sm font-montserrat font-semibold" style={{ color: COR_OURO }}>
              Solicitações dos Titulares (Art. 18 LGPD)
            </span>
            {!loadingSolic && (
              <span
                className="px-1.5 py-0.5 rounded text-xs font-mono"
                style={{ backgroundColor: 'rgba(183,154,90,0.15)', color: COR_OURO }}
              >
                {solicitacoes.length}
              </span>
            )}
          </div>
          <button
            onClick={carregarSolicitacoes}
            disabled={loadingSolic}
            className="p-1.5 rounded transition-opacity hover:opacity-70 disabled:opacity-40"
            title="Atualizar"
          >
            <RefreshCw size={13} style={{ color: 'rgba(255,255,255,0.4)' }} className={loadingSolic ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th className="px-4 py-3 text-left text-xs font-montserrat font-semibold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Devedor</th>
                <th className="px-4 py-3 text-left text-xs font-montserrat font-semibold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-montserrat font-semibold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Status</th>
                <th className="px-4 py-3 text-left text-xs font-montserrat font-semibold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Prazo Resposta</th>
                <th className="px-4 py-3 text-left text-xs font-montserrat font-semibold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Respondido em</th>
                <th className="px-4 py-3 text-left text-xs font-montserrat font-semibold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {loadingSolic ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonRow key={i} cols={6} />
                ))
              ) : erroSolic ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <AlertTriangle size={20} style={{ color: '#F87171' }} />
                      <p className="text-sm font-lato" style={{ color: '#FCA5A5' }}>{erroSolic}</p>
                    </div>
                  </td>
                </tr>
              ) : solicitacoes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <FileText size={28} style={{ color: 'rgba(255,255,255,0.15)' }} />
                      <p className="text-sm font-lato" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Nenhuma solicitação de titular registrada.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                solicitacoes.map(s => {
                  const dias = diasRestantes(s.prazo_resposta)
                  const prazoCritico = dias !== null && dias < 3
                    && (s.status === 'aberta' || s.status === 'em_analise')
                  const podeResponder = s.status === 'aberta' || s.status === 'em_analise'

                  return (
                    <tr
                      key={s.id}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      className="transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 font-lato text-xs" style={{ color: '#E2E8F0' }}>
                        {s.devedor_nome ?? s.devedor_id.slice(0, 8) + '…'}
                      </td>
                      <td className="px-4 py-3 font-lato text-xs" style={{ color: '#E2E8F0' }}>
                        {capitalizarTipo(s.tipo_solicitacao)}
                      </td>
                      <td className="px-4 py-3">
                        <BadgeStatus status={s.status} />
                      </td>
                      <td className="px-4 py-3 font-lato text-xs">
                        {s.prazo_resposta ? (
                          <div className="flex items-center gap-1.5">
                            {prazoCritico && <Clock size={11} style={{ color: '#F87171' }} />}
                            <span style={{ color: prazoCritico ? '#F87171' : 'rgba(255,255,255,0.5)' }}>
                              {formatarData(s.prazo_resposta)}
                              {prazoCritico && dias !== null && (
                                <span className="ml-1 font-semibold">({dias}d)</span>
                              )}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-lato text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {formatarData(s.respondido_em)}
                      </td>
                      <td className="px-4 py-3">
                        {podeResponder ? (
                          <button
                            onClick={() => setSolicitacaoSelecionada(s)}
                            className="px-3 py-1 rounded text-xs font-montserrat font-semibold transition-all"
                            style={{
                              backgroundColor: `rgba(90,18,32,0.3)`,
                              border: `1px solid ${COR_VINHO}`,
                              color: '#FDA4AE',
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLButtonElement).style.backgroundColor = COR_VINHO
                              ;(e.currentTarget as HTMLButtonElement).style.color = '#fff'
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(90,18,32,0.3)'
                              ;(e.currentTarget as HTMLButtonElement).style.color = '#FDA4AE'
                            }}
                          >
                            Responder
                          </button>
                        ) : (
                          <span className="text-xs font-lato" style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal de resposta ── */}
      {solicitacaoSelecionada && (
        <ModalResponder
          solicitacao={solicitacaoSelecionada}
          onFechar={() => setSolicitacaoSelecionada(null)}
          onSalvo={handleSalvoResposta}
        />
      )}
    </div>
  )
}
