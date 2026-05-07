import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  Plus,
  Loader2,
  AlertCircle,
  ChevronDown,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusProtesto =
  | 'aguardando_aprovacao'
  | 'solicitado'
  | 'enviado'
  | 'protestado'
  | 'cancelado'
  | 'pago_apos_protesto'

type TipoTitulo = 'cheque' | 'NP' | 'contrato' | 'duplicata' | 'outro'

interface Protesto {
  id: string
  caso_id: string
  valor: number
  tipo_titulo: TipoTitulo
  status: StatusProtesto
  exige_aprovacao: boolean
  aprovado_por: string | null
  aprovado_em: string | null
  numero_protocolo: string | null
  data_solicitacao: string | null
  data_envio: string | null
  data_cancelamento: string | null
  motivo_cancelamento: string | null
  pdf_url: string | null
  created_at: string
}

type StatusNegativacao =
  | 'pendente_notificacao'
  | 'notificado_aguardando'
  | 'negativado'
  | 'baixa_solicitada'
  | 'baixado'
  | 'cancelado'

interface Negativacao {
  id: string
  caso_id: string
  devedor_id: string
  bureau: string
  valor: number
  status: StatusNegativacao
  data_notificacao_previa: string | null
  canal_notificacao_previa: string | null
  data_negativacao: string | null
  data_baixa: string | null
  motivo_baixa: string | null
}

interface Props {
  caso_id: string
  etapa_atual: string
  valor_atual: number
  devedor_id: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COR_NAVY = '#0E1B2A'
const COR_OURO = '#B79A5A'

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

function daysBetween(dateStr: string, referenceDate: Date = new Date()): number {
  const target = new Date(dateStr + 'T00:00:00')
  const diff = referenceDate.getTime() - target.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

const ETAPAS_TARDIAS = ['D+30', 'D+35', 'JURIDICO', 'D+60', 'D+90']

// ---------------------------------------------------------------------------
// Status badge configs
// ---------------------------------------------------------------------------

interface BadgeConfig {
  label: string
  bg: string
  text: string
  border?: string
}

const BADGE_PROTESTO: Record<StatusProtesto, BadgeConfig> = {
  aguardando_aprovacao: { label: 'Aguardando Aprovação', bg: '#fef3c7', text: '#b45309' },
  solicitado: { label: 'Solicitado', bg: '#dbeafe', text: '#1d4ed8' },
  enviado: { label: 'Enviado', bg: COR_NAVY, text: COR_OURO, border: COR_OURO },
  protestado: { label: 'Protestado', bg: '#fee2e2', text: '#dc2626' },
  cancelado: { label: 'Cancelado', bg: '#f3f4f6', text: '#4b5563' },
  pago_apos_protesto: { label: 'Pago após Protesto', bg: '#dcfce7', text: '#15803d' },
}

const BADGE_NEGATIVACAO: Record<StatusNegativacao, BadgeConfig> = {
  pendente_notificacao: { label: 'Pendente Notificação', bg: '#fef3c7', text: '#b45309' },
  notificado_aguardando: { label: 'Notificado — Aguardando', bg: '#ffedd5', text: '#c2410c' },
  negativado: { label: 'Negativado', bg: '#fee2e2', text: '#dc2626' },
  baixa_solicitada: { label: 'Baixa Solicitada', bg: '#e0f2fe', text: '#0369a1' },
  baixado: { label: 'Baixado', bg: '#dcfce7', text: '#15803d' },
  cancelado: { label: 'Cancelado', bg: '#f3f4f6', text: '#4b5563' },
}

function StatusBadge({ config }: { config: BadgeConfig }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{
        backgroundColor: config.bg,
        color: config.text,
        border: config.border ? `1px solid ${config.border}` : 'none',
      }}
    >
      {config.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <div className="rounded-lg p-4 animate-pulse" style={{ backgroundColor: '#0b1520', border: '1px solid #1e3a5f' }}>
      <div className="h-4 rounded w-1/3 mb-3" style={{ backgroundColor: '#1e3a5f' }} />
      <div className="h-3 rounded w-1/2 mb-2" style={{ backgroundColor: '#1e3a5f' }} />
      <div className="h-3 rounded w-2/3" style={{ backgroundColor: '#1e3a5f' }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal base
// ---------------------------------------------------------------------------

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-xl shadow-2xl p-6 z-10"
        style={{ backgroundColor: '#0b1a28', border: '1px solid #1e3a5f' }}
      >
        <h3 className="text-lg font-bold mb-4" style={{ color: COR_OURO }}>
          {title}
        </h3>
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aba PROTESTO
// ---------------------------------------------------------------------------

interface AbaProtestoProps {
  caso_id: string
  etapa_atual: string
  valor_atual: number
  protestos: Protesto[]
  loading: boolean
  error: string | null
  onRefetch: () => void
}

function AbaProtesto({ caso_id, etapa_atual, valor_atual, protestos, loading, error, onRefetch }: AbaProtestoProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [tipoTitulo, setTipoTitulo] = useState<TipoTitulo>('cheque')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [aprovandoId, setAprovandoId] = useState<string | null>(null)

  const activeStatuses: StatusProtesto[] = ['aguardando_aprovacao', 'solicitado', 'enviado', 'protestado']
  const hasActiveProtesto = protestos.some((p) => activeStatuses.includes(p.status))
  const showSolicitar =
    !hasActiveProtesto || ETAPAS_TARDIAS.includes(etapa_atual)

  async function handleAprovarProtesto(id: string) {
    setAprovandoId(id)
    try {
      const { error: fnError } = await supabase.functions.invoke('aprovar-protesto', {
        body: { protesto_id: id },
      })
      if (fnError) throw fnError
      onRefetch()
    } catch (err) {
      console.error('Erro ao aprovar protesto:', err)
    } finally {
      setAprovandoId(null)
    }
  }

  async function handleSolicitarProtesto() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const { error: insertError } = await supabase.from('protestos').insert({
        caso_id,
        valor: valor_atual,
        tipo_titulo: tipoTitulo,
        status: 'aguardando_aprovacao',
        data_solicitacao: new Date().toISOString().split('T')[0],
      })
      if (insertError) throw insertError
      setModalOpen(false)
      onRefetch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg p-3 text-sm" style={{ backgroundColor: '#3b0a0a', border: '1px solid #dc2626', color: '#fca5a5' }}>
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {protestos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <FileText size={40} style={{ color: '#1e3a5f' }} />
          <p className="text-sm" style={{ color: '#4b6a8a' }}>
            Nenhum protesto registrado
          </p>
          {showSolicitar && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: COR_OURO, color: COR_NAVY }}
            >
              <Plus size={16} />
              Solicitar Protesto
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {protestos.map((p) => (
              <div
                key={p.id}
                className="rounded-lg p-4 space-y-2"
                style={{ backgroundColor: '#0b1520', border: '1px solid #1e3a5f' }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <StatusBadge config={BADGE_PROTESTO[p.status]} />
                  <span className="font-bold text-white">{formatBRL(p.valor)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: '#7a9ab8' }}>
                  <span>Tipo: <span className="text-white">{p.tipo_titulo}</span></span>
                  <span>Solicitado: <span className="text-white">{formatDate(p.data_solicitacao)}</span></span>
                  {p.numero_protocolo && (
                    <span className="col-span-2">
                      Protocolo: <span className="text-white">{p.numero_protocolo}</span>
                    </span>
                  )}
                </div>
                {p.status === 'aguardando_aprovacao' && (
                  <button
                    onClick={() => handleAprovarProtesto(p.id)}
                    disabled={aprovandoId === p.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ backgroundColor: '#22c55e', color: '#fff' }}
                  >
                    {aprovandoId === p.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                    Aprovar Protesto
                  </button>
                )}
              </div>
            ))}
          </div>

          {showSolicitar && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: COR_OURO, color: COR_NAVY }}
            >
              <Plus size={16} />
              Solicitar Protesto
            </button>
          )}
        </>
      )}

      {/* Modal Solicitar Protesto */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Solicitar Protesto">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: '#7a9ab8' }}>
            Você está solicitando o protesto do título abaixo. Confirme os dados antes de prosseguir.
          </p>

          <div className="rounded-lg p-3" style={{ backgroundColor: '#060e18', border: '1px solid #1e3a5f' }}>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: '#7a9ab8' }}>Valor</span>
              <span className="font-bold text-white">{formatBRL(valor_atual)}</span>
            </div>
          </div>

          {valor_atual > 5000 && (
            <div
              className="flex items-start gap-2 rounded-lg p-3 text-sm"
              style={{ backgroundColor: '#3b0a0a', border: '1px solid #ef4444', color: '#fca5a5' }}
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>Este protesto requerá aprovação explícita do advogado responsável.</span>
            </div>
          )}

          <div>
            <label className="block text-xs mb-1.5 font-medium" style={{ color: '#7a9ab8' }}>
              Tipo do Título
            </label>
            <div className="relative">
              <select
                value={tipoTitulo}
                onChange={(e) => setTipoTitulo(e.target.value as TipoTitulo)}
                className="w-full appearance-none rounded-lg px-3 py-2 text-sm text-white pr-8 focus:outline-none"
                style={{ backgroundColor: '#060e18', border: '1px solid #1e3a5f' }}
              >
                <option value="cheque">Cheque</option>
                <option value="NP">Nota Promissória (NP)</option>
                <option value="contrato">Contrato</option>
                <option value="duplicata">Duplicata</option>
                <option value="outro">Outro</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#4b6a8a' }} />
            </div>
          </div>

          {submitError && (
            <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: '#3b0a0a', border: '1px solid #dc2626', color: '#fca5a5' }}>
              {submitError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setModalOpen(false)}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#1e3a5f', color: '#7a9ab8' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSolicitarProtesto}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: COR_OURO, color: COR_NAVY }}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
              Confirmar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aba NEGATIVAÇÃO
// ---------------------------------------------------------------------------

interface AbaNegativacaoProps {
  caso_id: string
  etapa_atual: string
  valor_atual: number
  devedor_id: string
  negativacoes: Negativacao[]
  loading: boolean
  error: string | null
  onRefetch: () => void
}

function AbaNegativacao({
  caso_id,
  etapa_atual,
  valor_atual,
  devedor_id,
  negativacoes,
  loading,
  error,
  onRefetch,
}: AbaNegativacaoProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmaNotificacao, setConfirmaNotificacao] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const activeStatuses: StatusNegativacao[] = ['pendente_notificacao', 'notificado_aguardando', 'negativado', 'baixa_solicitada']
  const hasActiveNegativacao = negativacoes.some((n) => activeStatuses.includes(n.status))
  const isLateStage = ETAPAS_TARDIAS.includes(etapa_atual)
  const showIniciar = !hasActiveNegativacao && isLateStage

  async function handleIniciarNegativacao() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const today = new Date().toISOString().split('T')[0]
      const { error: insertError } = await supabase.from('negativacoes').insert({
        caso_id,
        devedor_id,
        bureau: 'serasa',
        valor: valor_atual,
        data_notificacao_previa: today,
        status: 'pendente_notificacao',
        data_vencimento_original: today,
      })
      if (insertError) throw insertError
      setModalOpen(false)
      setConfirmaNotificacao(false)
      onRefetch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  function renderNegativacaoExtra(n: Negativacao) {
    const today = new Date()
    if (n.status === 'pendente_notificacao' && n.data_notificacao_previa) {
      const diasDecorridos = daysBetween(n.data_notificacao_previa, today)
      const diasRestantes = Math.max(0, 10 - diasDecorridos)
      return (
        <div className="mt-2 text-xs space-y-1">
          <span style={{ color: '#7a9ab8' }}>
            Notificação enviada em: <span className="text-white">{formatDate(n.data_notificacao_previa)}</span>
          </span>
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded"
            style={{ backgroundColor: diasRestantes === 0 ? '#14532d' : '#422006', color: diasRestantes === 0 ? '#86efac' : '#fdba74' }}
          >
            <Clock size={12} />
            {diasRestantes === 0
              ? 'Prazo cumprido — pode negativar'
              : `${diasRestantes} dia${diasRestantes !== 1 ? 's' : ''} para poder negativar`}
          </div>
        </div>
      )
    }
    if (n.status === 'notificado_aguardando') {
      return (
        <div className="mt-2 text-xs space-y-1" style={{ color: '#7a9ab8' }}>
          <span>Notificação em: <span className="text-white">{formatDate(n.data_notificacao_previa)}</span></span>
          {n.canal_notificacao_previa && (
            <span className="ml-3">Canal: <span className="text-white">{n.canal_notificacao_previa}</span></span>
          )}
        </div>
      )
    }
    if (n.status === 'negativado') {
      return (
        <div className="mt-2 text-xs space-y-1" style={{ color: '#7a9ab8' }}>
          <span>Negativado em: <span className="text-white">{formatDate(n.data_negativacao)}</span></span>
          <span className="ml-3">Bureau: <span className="text-white uppercase">{n.bureau}</span></span>
        </div>
      )
    }
    if (n.status === 'baixado') {
      return (
        <div className="mt-2 text-xs" style={{ color: '#7a9ab8' }}>
          Baixa em: <span className="text-white">{formatDate(n.data_baixa)}</span>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg p-3 text-sm" style={{ backgroundColor: '#3b0a0a', border: '1px solid #dc2626', color: '#fca5a5' }}>
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {negativacoes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <XCircle size={40} style={{ color: '#1e3a5f' }} />
          <p className="text-sm" style={{ color: '#4b6a8a' }}>
            Nenhuma negativação registrada
          </p>
          {showIniciar && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: COR_OURO, color: COR_NAVY }}
            >
              <Plus size={16} />
              Iniciar Negativação
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {negativacoes.map((n) => (
              <div
                key={n.id}
                className="rounded-lg p-4"
                style={{ backgroundColor: '#0b1520', border: '1px solid #1e3a5f' }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <StatusBadge config={BADGE_NEGATIVACAO[n.status]} />
                  <span className="font-bold text-white">{formatBRL(n.valor)}</span>
                </div>
                {renderNegativacaoExtra(n)}
              </div>
            ))}
          </div>

          {showIniciar && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: COR_OURO, color: COR_NAVY }}
            >
              <Plus size={16} />
              Iniciar Negativação
            </button>
          )}
        </>
      )}

      {/* Modal Iniciar Negativação */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setConfirmaNotificacao(false) }} title="Iniciar Negativação">
        <div className="space-y-4">
          <div
            className="rounded-lg p-3 text-sm space-y-2"
            style={{ backgroundColor: '#0a1929', border: '1px solid #1e3a5f', color: '#7a9ab8' }}
          >
            <p className="font-semibold text-white">Processo de Negativação — 2 etapas obrigatórias</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>
                <strong style={{ color: '#fdba74' }}>Notificação prévia obrigatória</strong> — O devedor deve ser
                notificado formalmente antes de qualquer negativação (Art. 43 §2º CDC). O prazo mínimo é de{' '}
                <strong className="text-white">10 dias</strong> após a notificação.
              </li>
              <li>
                <strong style={{ color: '#fdba74' }}>Negativação efetiva</strong> — Somente após decorrido o prazo
                legal, a negativação pode ser registrada no bureau (Serasa).
              </li>
            </ol>
          </div>

          <div className="rounded-lg p-3" style={{ backgroundColor: '#060e18', border: '1px solid #1e3a5f' }}>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: '#7a9ab8' }}>Valor</span>
              <span className="font-bold text-white">{formatBRL(valor_atual)}</span>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmaNotificacao}
              onChange={(e) => setConfirmaNotificacao(e.target.checked)}
              className="mt-0.5 shrink-0 w-4 h-4 rounded accent-yellow-500"
            />
            <span className="text-xs leading-relaxed" style={{ color: '#7a9ab8' }}>
              Confirmo que enviarei a notificação prévia obrigatória (Art. 43 §2º CDC) antes de negativar, respeitando
              o prazo mínimo de 10 dias.
            </span>
          </label>

          {submitError && (
            <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: '#3b0a0a', border: '1px solid #dc2626', color: '#fca5a5' }}>
              {submitError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setModalOpen(false); setConfirmaNotificacao(false) }}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#1e3a5f', color: '#7a9ab8' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleIniciarNegativacao}
              disabled={!confirmaNotificacao || submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: COR_OURO, color: COR_NAVY }}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
              Confirmar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PainelProtestoNegativacao({ caso_id, etapa_atual, valor_atual, devedor_id }: Props) {
  type Aba = 'protesto' | 'negativacao'
  const [abaAtiva, setAbaAtiva] = useState<Aba>('protesto')

  const [protestos, setProtestos] = useState<Protesto[]>([])
  const [negativacoes, setNegativacoes] = useState<Negativacao[]>([])
  const [loadingProtestos, setLoadingProtestos] = useState(true)
  const [loadingNegativacoes, setLoadingNegativacoes] = useState(true)
  const [errorProtestos, setErrorProtestos] = useState<string | null>(null)
  const [errorNegativacoes, setErrorNegativacoes] = useState<string | null>(null)

  const fetchProtestos = useCallback(async () => {
    setLoadingProtestos(true)
    setErrorProtestos(null)
    try {
      const { data, error } = await supabase
        .from('protestos')
        .select('*')
        .eq('caso_id', caso_id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setProtestos((data as Protesto[]) ?? [])
    } catch (err) {
      setErrorProtestos(err instanceof Error ? err.message : 'Erro ao carregar protestos')
    } finally {
      setLoadingProtestos(false)
    }
  }, [caso_id])

  const fetchNegativacoes = useCallback(async () => {
    setLoadingNegativacoes(true)
    setErrorNegativacoes(null)
    try {
      const { data, error } = await supabase
        .from('negativacoes')
        .select('*')
        .eq('caso_id', caso_id)
        .order('id', { ascending: false })
      if (error) throw error
      setNegativacoes((data as Negativacao[]) ?? [])
    } catch (err) {
      setErrorNegativacoes(err instanceof Error ? err.message : 'Erro ao carregar negativações')
    } finally {
      setLoadingNegativacoes(false)
    }
  }, [caso_id])

  useEffect(() => {
    fetchProtestos()
    fetchNegativacoes()
  }, [fetchProtestos, fetchNegativacoes])

  const tabs: { key: Aba; label: string }[] = [
    { key: 'protesto', label: 'PROTESTO' },
    { key: 'negativacao', label: 'NEGATIVAÇÃO' },
  ]

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: '#060e18', border: '1px solid #1e3a5f' }}
    >
      {/* Header / Tabs */}
      <div
        className="flex items-center border-b px-4"
        style={{ borderColor: '#1e3a5f', backgroundColor: '#080f1c' }}
      >
        {tabs.map((tab) => {
          const isActive = abaAtiva === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setAbaAtiva(tab.key)}
              className="relative py-3.5 px-4 text-xs font-bold tracking-wider transition-colors"
              style={{ color: isActive ? COR_OURO : '#4b6a8a' }}
            >
              {tab.label}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                  style={{ backgroundColor: COR_OURO }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="p-4">
        {abaAtiva === 'protesto' ? (
          <AbaProtesto
            caso_id={caso_id}
            etapa_atual={etapa_atual}
            valor_atual={valor_atual}
            protestos={protestos}
            loading={loadingProtestos}
            error={errorProtestos}
            onRefetch={fetchProtestos}
          />
        ) : (
          <AbaNegativacao
            caso_id={caso_id}
            etapa_atual={etapa_atual}
            valor_atual={valor_atual}
            devedor_id={devedor_id}
            negativacoes={negativacoes}
            loading={loadingNegativacoes}
            error={errorNegativacoes}
            onRefetch={fetchNegativacoes}
          />
        )}
      </div>
    </div>
  )
}
