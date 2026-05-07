/**
 * ConfiguracaoRegua — Painel de configuração da régua de cobrança.
 *
 * Visualização horizontal D-5 a D+35 com status dos steps.
 * Permite criar, editar, ativar e pausar réguas.
 */

import { useState, useCallback } from 'react'
import {
  Play, Pause, Plus, Trash2, Save, CheckCircle2,
  MessageSquare, Mail, Bell, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useRegua, type PassoRegua, type RegraCobranca } from '@/hooks/cobranca/useRegua'

// ── Constantes ─────────────────────────────────────────────────

const COR_NAVY  = '#0E1B2A'
const COR_OURO  = '#B79A5A'
const COR_VINHO = '#5A1220'

const DIAS_REGUA = [-5, -1, 1, 3, 7, 15, 30, 35]

const CANAIS: { value: string; label: string }[] = [
  { value: 'whatsapp',        label: 'WhatsApp'          },
  { value: 'email',           label: 'E-mail'            },
  { value: 'whatsapp_email',  label: 'WhatsApp + E-mail' },
  { value: 'whatsapp_sms',    label: 'WhatsApp + SMS'    },
  { value: 'email_carta_pdf', label: 'E-mail + Carta PDF'},
  { value: 'email_sms',       label: 'E-mail + SMS'      },
  { value: 'sms',             label: 'SMS'               },
  { value: 'sistema',         label: 'Ação do sistema'   },
]

const TONS: { value: string; label: string }[] = [
  { value: 'amigavel',   label: 'Amigável'   },
  { value: 'formal',     label: 'Formal'     },
  { value: 'negociacao', label: 'Negociação' },
  { value: 'juridico',   label: 'Jurídico'   },
  { value: 'automatico', label: 'Automático' },
]

const TEMPLATES: { value: string; label: string }[] = [
  { value: 'lembrete_vencimento',   label: 'Lembrete de vencimento'      },
  { value: 'link_pix_vencimento',   label: 'Link Pix pré-vencimento'     },
  { value: 'aviso_vencido',         label: 'Aviso de título vencido'     },
  { value: 'link_pagamento',        label: 'Link de pagamento'           },
  { value: 'proposta_acordo',       label: 'Proposta de acordo'          },
  { value: 'notificacao_preventiva',label: 'Notificação preventiva (PDF)'},
  { value: 'aviso_protesto',        label: 'Aviso de protesto eminente'  },
  { value: 'executar_protesto',     label: 'Acionar protesto (sistema)'  },
]

// ── Helpers ────────────────────────────────────────────────────

function canalIcon(canal: string) {
  if (canal.includes('whatsapp')) return <MessageSquare size={13} />
  if (canal.includes('email'))    return <Mail          size={13} />
  if (canal === 'sistema')        return <Bell          size={13} />
  return <Bell size={13} />
}

function tomCor(tom: string): string {
  switch (tom) {
    case 'amigavel':   return '#22c55e'
    case 'formal':     return '#3b82f6'
    case 'negociacao': return '#f59e0b'
    case 'juridico':   return COR_VINHO
    default:           return '#6b7280'
  }
}

function labelDia(dia: number): string {
  if (dia < 0)  return `D${dia}`
  if (dia === 0) return 'D0'
  return `D+${dia}`
}

// ── Timeline horizontal ────────────────────────────────────────

function TimelineRegua({ passos }: { passos: PassoRegua[] }) {
  const passosDias = DIAS_REGUA
  const mapPasso = new Map(passos.map(p => [p.dia, p]))

  return (
    <div className="overflow-x-auto py-4">
      <div className="flex items-start gap-0 min-w-max px-4">
        {passosDias.map((dia, idx) => {
          const passo = mapPasso.get(dia)
          const isLast = idx === passosDias.length - 1

          return (
            <div key={dia} className="flex items-start">
              {/* Nó */}
              <div className="flex flex-col items-center gap-1" style={{ width: 90 }}>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center border-2 text-xs font-bold"
                  style={{
                    borderColor: passo ? COR_OURO : '#374151',
                    backgroundColor: passo ? COR_NAVY : '#1f2937',
                    color: passo ? COR_OURO : '#6b7280',
                  }}
                >
                  {labelDia(dia)}
                </div>
                {passo ? (
                  <div className="flex flex-col items-center gap-0.5 text-center">
                    <div
                      className="flex items-center gap-0.5 text-xs"
                      style={{ color: COR_OURO }}
                    >
                      {canalIcon(passo.canal)}
                    </div>
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: tomCor(passo.tom) + '22', color: tomCor(passo.tom), fontSize: 10 }}
                    >
                      {passo.tom}
                    </span>
                    <span className="text-gray-400" style={{ fontSize: 9, maxWidth: 80, lineHeight: 1.2 }}>
                      {TEMPLATES.find(t => t.value === passo.template)?.label ?? passo.template}
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-600" style={{ fontSize: 10 }}>—</span>
                )}
              </div>

              {/* Conector */}
              {!isLast && (
                <div
                  className="h-0.5 mt-5 flex-1"
                  style={{ minWidth: 24, backgroundColor: passo ? COR_OURO + '66' : '#374151' }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Editor de passo ────────────────────────────────────────────

interface EditorPassoProps {
  passo: PassoRegua
  index: number
  onChange: (index: number, passo: PassoRegua) => void
  onRemove: (index: number) => void
}

function EditorPasso({ passo, index, onChange, onRemove }: EditorPassoProps) {
  const sel = (field: keyof PassoRegua, value: unknown) =>
    onChange(index, { ...passo, [field]: value })

  return (
    <div
      className="rounded-lg p-3 border"
      style={{ backgroundColor: '#0a1520', borderColor: '#1e3a5f' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono font-bold" style={{ color: COR_OURO, fontSize: 13 }}>
          {labelDia(passo.dia)}
        </span>
        <button
          onClick={() => onRemove(index)}
          className="text-gray-500 hover:text-red-400 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="block text-gray-400 mb-1">Dia</label>
          <input
            type="number"
            value={passo.dia}
            min={-30}
            max={60}
            onChange={e => sel('dia', Number(e.target.value))}
            className="w-full rounded px-2 py-1 text-white border border-gray-700 focus:outline-none focus:border-yellow-600"
            style={{ backgroundColor: '#0d1b2a' }}
          />
        </div>
        <div>
          <label className="block text-gray-400 mb-1">Canal</label>
          <select
            value={passo.canal}
            onChange={e => sel('canal', e.target.value)}
            className="w-full rounded px-2 py-1 text-white border border-gray-700 focus:outline-none focus:border-yellow-600"
            style={{ backgroundColor: '#0d1b2a' }}
          >
            {CANAIS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-gray-400 mb-1">Tom</label>
          <select
            value={passo.tom}
            onChange={e => sel('tom', e.target.value as PassoRegua['tom'])}
            className="w-full rounded px-2 py-1 text-white border border-gray-700 focus:outline-none focus:border-yellow-600"
            style={{ backgroundColor: '#0d1b2a' }}
          >
            {TONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-gray-400 mb-1">Template</label>
          <select
            value={passo.template}
            onChange={e => sel('template', e.target.value)}
            className="w-full rounded px-2 py-1 text-white border border-gray-700 focus:outline-none focus:border-yellow-600"
            style={{ backgroundColor: '#0d1b2a' }}
          >
            {TEMPLATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}

// ── Card de régua ──────────────────────────────────────────────

interface CardReguaProps {
  regra:     RegraCobranca
  isAtiva:   boolean
  onAtivar:  () => void
  onEditar:  () => void
  onExcluir: () => void
}

function CardRegua({ regra, isAtiva, onAtivar, onEditar, onExcluir }: CardReguaProps) {
  const [expandida, setExpandida] = useState(false)

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        backgroundColor: '#0a1520',
        borderColor: isAtiva ? COR_OURO : '#1e3a5f',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: isAtiva ? COR_NAVY : '#0d1b2a' }}
      >
        <div className="flex items-center gap-2">
          {isAtiva && <CheckCircle2 size={14} style={{ color: COR_OURO }} />}
          <span className="font-bold text-sm" style={{ color: isAtiva ? COR_OURO : '#d1d5db' }}>
            {regra.nome}
          </span>
          {regra.tipo_caso && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900 text-blue-300">
              {regra.tipo_caso}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isAtiva && (
            <button
              onClick={onAtivar}
              className="text-xs px-3 py-1 rounded-full font-medium transition-colors hover:opacity-80"
              style={{ backgroundColor: COR_OURO + '22', color: COR_OURO, border: `1px solid ${COR_OURO}` }}
            >
              Ativar
            </button>
          )}
          <button
            onClick={onEditar}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Editar
          </button>
          {!isAtiva && (
            <button
              onClick={onExcluir}
              className="text-gray-600 hover:text-red-400 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={() => setExpandida(v => !v)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {expandida ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Timeline preview */}
      {expandida && (
        <>
          {regra.descricao && (
            <p className="px-4 pt-2 text-xs text-gray-400">{regra.descricao}</p>
          )}
          <TimelineRegua passos={regra.passos_json} />
          <div className="px-4 pb-3 text-xs text-gray-500">
            {regra.passos_json.length} passo(s) configurado(s)
          </div>
        </>
      )}
    </div>
  )
}

// ── Editor modal ───────────────────────────────────────────────

interface EditorReguaProps {
  regra:     Partial<RegraCobranca>
  onSalvar:  (r: Partial<RegraCobranca>) => void
  onCancelar: () => void
}

function EditorRegua({ regra, onSalvar, onCancelar }: EditorReguaProps) {
  const [nome,    setNome]    = useState(regra.nome ?? '')
  const [desc,    setDesc]    = useState(regra.descricao ?? '')
  const [tipo,    setTipo]    = useState(regra.tipo_caso ?? '')
  const [passos,  setPassos]  = useState<PassoRegua[]>(regra.passos_json ?? [])
  const [salvando, setSalvando] = useState(false)

  const adicionarPasso = () => {
    const dia = passos.length > 0 ? Math.max(...passos.map(p => p.dia)) + 7 : 1
    setPassos(prev => [...prev, {
      dia,
      canal:    'whatsapp',
      tom:      'formal',
      template: 'aviso_vencido',
    }])
  }

  const atualizarPasso = (index: number, passo: PassoRegua) => {
    setPassos(prev => prev.map((p, i) => i === index ? passo : p))
  }

  const removerPasso = (index: number) => {
    setPassos(prev => prev.filter((_, i) => i !== index))
  }

  const handleSalvar = async () => {
    if (!nome.trim()) return
    setSalvando(true)
    const passosOrdenados = [...passos].sort((a, b) => a.dia - b.dia)
    await onSalvar({ ...regra, nome: nome.trim(), descricao: desc || null, tipo_caso: tipo || null, passos_json: passosOrdenados })
    setSalvando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ backgroundColor: '#0d1b2a', border: `1px solid ${COR_OURO}44` }}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg" style={{ color: COR_OURO }}>
            {regra.id ? 'Editar Régua' : 'Nova Régua de Cobrança'}
          </h2>
          <button onClick={onCancelar} className="text-gray-400 hover:text-white text-xl">×</button>
        </div>

        {/* Campos básicos */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Nome da régua *</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-white border border-gray-700 focus:outline-none focus:border-yellow-600 text-sm"
              style={{ backgroundColor: '#0a1520' }}
              placeholder="Ex: Régua Padrão — Pessoa Física"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Descrição</label>
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-white border border-gray-700 focus:outline-none focus:border-yellow-600 text-sm"
              style={{ backgroundColor: '#0a1520' }}
              placeholder="Opcional"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tipo de caso</label>
            <input
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-white border border-gray-700 focus:outline-none focus:border-yellow-600 text-sm"
              style={{ backgroundColor: '#0a1520' }}
              placeholder="Vazio = todos os tipos"
            />
          </div>
        </div>

        {/* Preview timeline */}
        {passos.length > 0 && (
          <div className="mb-4 rounded-lg overflow-hidden border border-gray-800">
            <div className="px-3 py-2 text-xs font-medium" style={{ backgroundColor: COR_NAVY, color: COR_OURO }}>
              Preview da Timeline
            </div>
            <TimelineRegua passos={passos} />
          </div>
        )}

        {/* Editor de passos */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-300">Passos ({passos.length})</span>
            <button
              onClick={adicionarPasso}
              className="flex items-center gap-1 text-xs px-3 py-1 rounded-full transition-colors hover:opacity-80"
              style={{ backgroundColor: COR_OURO + '22', color: COR_OURO, border: `1px solid ${COR_OURO}` }}
            >
              <Plus size={12} /> Adicionar Passo
            </button>
          </div>

          {passos.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm rounded-lg border border-dashed border-gray-700">
              Nenhum passo. Clique em "Adicionar Passo".
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {passos.map((p, i) => (
                <EditorPasso
                  key={i}
                  passo={p}
                  index={i}
                  onChange={atualizarPasso}
                  onRemove={removerPasso}
                />
              ))}
            </div>
          )}
        </div>

        {/* Aviso passo sistema */}
        {passos.some(p => p.canal === 'sistema' && p.template === 'executar_protesto') && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg mb-4 text-xs"
            style={{ backgroundColor: '#7c1a1a22', border: '1px solid #7c1a1a', color: '#fca5a5' }}
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              O passo "Acionar protesto (sistema)" cria uma solicitação com status
              <strong> aguardando_aprovação</strong> — nunca envia automaticamente.
              Um advogado deve aprovar manualmente.
            </span>
          </div>
        )}

        {/* Botões */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancelar}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors border border-gray-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando || !nome.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: COR_OURO, color: COR_NAVY }}
          >
            <Save size={14} />
            {salvando ? 'Salvando…' : 'Salvar Régua'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────

export default function ConfiguracaoRegua() {
  const { regras, reguaAtiva, isLoading, erro, salvarRegua, ativarRegua, excluirRegua } = useRegua()
  const [editando, setEditando]     = useState<Partial<RegraCobranca> | null>(null)
  const [salvando, setSalvando]     = useState(false)
  const [msgSucesso, setMsgSucesso] = useState('')

  const mostrarSucesso = useCallback((msg: string) => {
    setMsgSucesso(msg)
    setTimeout(() => setMsgSucesso(''), 3000)
  }, [])

  const handleSalvar = async (regra: Partial<RegraCobranca>) => {
    setSalvando(true)
    const ok = await salvarRegua(regra)
    setSalvando(false)
    if (ok) {
      setEditando(null)
      mostrarSucesso('Régua salva com sucesso.')
    }
  }

  const handleAtivar = async (id: string) => {
    const ok = await ativarRegua(id)
    if (ok) mostrarSucesso('Régua ativada. O motor usará esta cadência nas próximas execuções.')
  }

  const handleExcluir = async (id: string) => {
    if (!window.confirm('Excluir esta régua? Esta ação não pode ser desfeita.')) return
    await excluirRegua(id)
    mostrarSucesso('Régua excluída.')
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#060e18' }}>
      {/* Header VINDEX */}
      <div className="px-6 py-4" style={{ backgroundColor: COR_NAVY, borderBottom: `2px solid ${COR_OURO}33` }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-bold text-xl" style={{ color: COR_OURO }}>
              Régua de Cobrança
            </h1>
            <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
              Cadências automáticas de comunicação — D-5 a D+35
            </p>
          </div>

          <div className="flex items-center gap-3">
            {reguaAtiva && (
              <div className="flex items-center gap-1.5 text-xs" style={{ color: '#4ade80' }}>
                <Play size={12} fill="currentColor" />
                Ativa: <strong>{reguaAtiva.nome}</strong>
              </div>
            )}
            <button
              onClick={() => setEditando({})}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
              style={{ backgroundColor: COR_OURO, color: COR_NAVY }}
            >
              <Plus size={14} /> Nova Régua
            </button>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* Sucesso */}
        {msgSucesso && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-lg mb-4 text-sm"
            style={{ backgroundColor: '#14532d44', border: '1px solid #166534', color: '#86efac' }}
          >
            <CheckCircle2 size={14} />
            {msgSucesso}
          </div>
        )}

        {/* Erro */}
        {erro && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-lg mb-4 text-sm"
            style={{ backgroundColor: '#7c1a1a22', border: '1px solid #7c1a1a', color: '#fca5a5' }}
          >
            <AlertTriangle size={14} />
            {erro}
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: COR_OURO, borderTopColor: 'transparent' }}
            />
          </div>
        ) : regras.length === 0 ? (
          <div className="text-center py-16">
            <Pause size={40} className="mx-auto mb-3 opacity-20" style={{ color: COR_OURO }} />
            <p className="text-gray-400 text-sm">Nenhuma régua configurada.</p>
            <button
              onClick={() => setEditando({})}
              className="mt-4 text-sm underline"
              style={{ color: COR_OURO }}
            >
              Criar primeira régua
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Aviso horário */}
            <div
              className="flex items-start gap-2 px-4 py-3 rounded-lg text-xs"
              style={{ backgroundColor: '#1e3a5f22', border: '1px solid #1e3a5f', color: '#93c5fd' }}
            >
              <Bell size={13} className="mt-0.5 shrink-0" />
              <span>
                O motor executa automaticamente de <strong>segunda a sábado, 08h–20h</strong> (horário de Brasília),
                exceto feriados nacionais. Proteção de 48h de silêncio por canal por caso.
              </span>
            </div>

            {regras.map(regra => (
              <CardRegua
                key={regra.id}
                regra={regra}
                isAtiva={reguaAtiva?.id === regra.id}
                onAtivar={() => handleAtivar(regra.id)}
                onEditar={() => setEditando(regra)}
                onExcluir={() => handleExcluir(regra.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal editor */}
      {editando !== null && !salvando && (
        <EditorRegua
          regra={editando}
          onSalvar={handleSalvar}
          onCancelar={() => setEditando(null)}
        />
      )}
    </div>
  )
}
