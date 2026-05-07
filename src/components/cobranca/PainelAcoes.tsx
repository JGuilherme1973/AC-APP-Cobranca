/**
 * PainelAcoes — Painel de ações rápidas da Ficha do Caso.
 * 4 botões: WhatsApp · Email · Registrar Evento · Gerar PDF
 * Cada um abre um modal contextual.
 */

import { useState } from 'react'
import { MessageCircle, Mail, FilePlus, FileDown, X, Send, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { gerarNotificacaoExtrajudicial, downloadPDF } from '@/lib/pdfGenerator'
import { formatarMoeda } from '@/lib/utils'
import type { CasoCompleto } from '@/hooks/cobranca/useFichaCaso'

// ── Templates ────────────────────────────────────────────────
const TEMPLATES_WA = [
  {
    id: 'notificacao_inicial',
    label: 'Notificação Inicial',
    gerar: (c: CasoCompleto) =>
      `Prezado(a) *${c.titulo.devedor.nome}*,\n\n` +
      `Representamos o(a) *${c.titulo.credor.nome}*, credor(a) de V. Sa. pelo valor de ` +
      `*${formatarMoeda(c.titulo.valor_atualizado)}*, atualizado até a presente data.\n\n` +
      `Solicitamos o contato com nosso escritório no prazo de *72 horas* para regularização ` +
      `da situação e evitar medidas judiciais.\n\n` +
      `*ANDRADE & CINTRA Advogados*\n(11) 99607-1463`,
  },
  {
    id: 'followup_d3',
    label: 'Follow-up D+3',
    gerar: (c: CasoCompleto) =>
      `Prezado(a) *${c.titulo.devedor.nome}*,\n\n` +
      `Ainda não recebemos retorno referente ao débito de *${formatarMoeda(c.titulo.valor_atualizado)}*. ` +
      `Reiteramos a necessidade de regularização imediata.\n\n` +
      `Entre em contato conosco para discutirmos uma proposta de acordo.\n\n` +
      `*ANDRADE & CINTRA Advogados*`,
  },
  {
    id: 'proposta_acordo',
    label: 'Proposta de Acordo',
    gerar: (c: CasoCompleto) =>
      `Prezado(a) *${c.titulo.devedor.nome}*,\n\n` +
      `Estamos autorizados pelo(a) ${c.titulo.credor.nome} a apresentar proposta de acordo ` +
      `referente ao débito de *${formatarMoeda(c.titulo.valor_atualizado)}*.\n\n` +
      `Entre em contato para análise da proposta dentro do prazo de *5 dias úteis*.\n\n` +
      `*ANDRADE & CINTRA Advogados*\n(11) 99607-1463`,
  },
]

const TEMPLATES_EMAIL = [
  {
    id: 'notificacao_extrajudicial',
    label: 'Notificação Extrajudicial',
    assunto: (c: CasoCompleto) => `Notificação Extrajudicial — ${c.titulo.credor.nome} x ${c.titulo.devedor.nome}`,
    gerar: (c: CasoCompleto) =>
      `Prezado(a) ${c.titulo.devedor.nome},\n\n` +
      `Em nome do(a) ${c.titulo.credor.nome}, notificamos V. Sa. da existência do débito no valor ` +
      `de ${formatarMoeda(c.titulo.valor_atualizado)}, atualizado até ${format(new Date(), 'dd/MM/yyyy')}.\n\n` +
      `Solicitamos o pagamento no prazo de 15 (quinze) dias corridos, sob pena de adoção das ` +
      `medidas judiciais cabíveis, incluindo ação judicial e protesto em cartório.\n\n` +
      `Atenciosamente,\n${c.advogado?.nome ?? 'Advogado Responsável'}\nANDRADE & CINTRA Advogados`,
  },
  {
    id: 'lembrete_prazo',
    label: 'Lembrete de Prazo',
    assunto: (c: CasoCompleto) => `Lembrete: Prazo de Pagamento — ${c.titulo.credor.nome}`,
    gerar: (c: CasoCompleto) =>
      `Prezado(a) ${c.titulo.devedor.nome},\n\n` +
      `Este é um lembrete sobre o débito de ${formatarMoeda(c.titulo.valor_atualizado)} em favor ` +
      `de ${c.titulo.credor.nome}.\n\n` +
      `O prazo para regularização está se aproximando. Entre em contato conosco imediatamente ` +
      `para evitar consequências legais.\n\n` +
      `ANDRADE & CINTRA Advogados`,
  },
]

const TIPOS_EVENTO = [
  'OUTRO', 'COMUNICACAO_ENVIADA', 'RESPOSTA_RECEBIDA',
  'PAGAMENTO_PARCIAL', 'DISTRIBUICAO_ACAO', 'DECISAO_JUDICIAL',
  'PENHORA_EFETIVADA', 'ACORDO_FECHADO',
] as const

// ── Modal Base ────────────────────────────────────────────────
function Modal({ titulo, onClose, children }: {
  titulo: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(13, 27, 42, 0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg rounded-lg shadow-2xl overflow-hidden"
        style={{ backgroundColor: '#FAFAF8', border: '1px solid #E2D9C8' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ backgroundColor: '#0E1B2A', borderBottom: '1px solid rgba(183,154,90,0.2)' }}
        >
          <h3 className="font-cinzel text-sm font-semibold" style={{ color: '#B79A5A' }}>
            {titulo}
          </h3>
          <button onClick={onClose}
            className="p-1 rounded transition-colors hover:opacity-70"
            style={{ color: '#8AA3BE' }}>
            <X size={16} />
          </button>
        </div>
        {/* Body */}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ── Modal WhatsApp ────────────────────────────────────────────
function ModalWhatsApp({ caso, onClose, onEnviar }: {
  caso: CasoCompleto
  onClose: () => void
  onEnviar: (template: string, conteudo: string) => Promise<void>
}) {
  const [templateId, setTemplateId] = useState(TEMPLATES_WA[0].id)
  const [enviando, setEnviando]     = useState(false)
  const template = TEMPLATES_WA.find(t => t.id === templateId)!
  const preview  = template.gerar(caso)
  const numero   = caso.titulo.devedor.telefones?.[0]?.replace(/\D/g, '') ?? ''

  const handleEnviar = async () => {
    setEnviando(true)
    await onEnviar(template.label, preview)
    setEnviando(false)
    onClose()
  }

  return (
    <Modal titulo="Enviar WhatsApp" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label-ac">Template</label>
          <div className="flex gap-2 flex-wrap">
            {TEMPLATES_WA.map(t => (
              <button key={t.id} type="button"
                onClick={() => setTemplateId(t.id)}
                className="px-3 py-1.5 rounded text-xs font-montserrat font-semibold transition-all border"
                style={{
                  backgroundColor: templateId === t.id ? '#5A1220' : 'white',
                  color:           templateId === t.id ? 'white'   : '#6B6B6B',
                  borderColor:     templateId === t.id ? '#5A1220' : '#E2D9C8',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label-ac">Prévia da Mensagem</label>
          <div
            className="rounded-lg p-4 text-sm font-lato whitespace-pre-wrap leading-relaxed"
            style={{ backgroundColor: '#DCF8C6', border: '1px solid #A3D977', color: '#1A1A1A' }}
          >
            {preview}
          </div>
        </div>

        {numero && (
          <p className="font-lato text-xs" style={{ color: '#9B9B9B' }}>
            Envio para: +55 {numero}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded text-sm font-montserrat font-semibold border transition-colors"
            style={{ borderColor: '#E2D9C8', color: '#6B6B6B' }}>
            Cancelar
          </button>
          <button onClick={handleEnviar} disabled={enviando}
            className="flex-1 py-2.5 rounded text-sm font-montserrat font-semibold text-white
                       flex items-center justify-center gap-2 transition-colors"
            style={{ backgroundColor: '#25D366' }}>
            {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {enviando ? 'Registrando...' : 'Registrar Envio'}
          </button>
        </div>
        <p className="font-lato text-[10px] text-center" style={{ color: '#C0C0C0' }}>
          O envio real requer integração com Evolution API / Twilio configurada no servidor.
        </p>
      </div>
    </Modal>
  )
}

// ── Modal Email ───────────────────────────────────────────────
function ModalEmail({ caso, onClose, onEnviar }: {
  caso: CasoCompleto
  onClose: () => void
  onEnviar: (template: string, destinatario: string, conteudo: string) => Promise<void>
}) {
  const [templateId, setTemplateId] = useState(TEMPLATES_EMAIL[0].id)
  const [enviando, setEnviando]     = useState(false)
  const template    = TEMPLATES_EMAIL.find(t => t.id === templateId)!
  const conteudo    = template.gerar(caso)
  const assunto     = template.assunto(caso)
  const destinatario = caso.titulo.devedor.emails?.[0] ?? ''

  const handleEnviar = async () => {
    setEnviando(true)
    await onEnviar(template.label, destinatario, `Assunto: ${assunto}\n\n${conteudo}`)
    setEnviando(false)
    onClose()
  }

  return (
    <Modal titulo="Enviar E-mail" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label-ac">Template</label>
          <div className="flex gap-2 flex-wrap">
            {TEMPLATES_EMAIL.map(t => (
              <button key={t.id} type="button"
                onClick={() => setTemplateId(t.id)}
                className="px-3 py-1.5 rounded text-xs font-montserrat font-semibold transition-all border"
                style={{
                  backgroundColor: templateId === t.id ? '#5A1220' : 'white',
                  color:           templateId === t.id ? 'white'   : '#6B6B6B',
                  borderColor:     templateId === t.id ? '#5A1220' : '#E2D9C8',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label-ac">Assunto</label>
          <p className="font-lato text-sm px-3 py-2 rounded border"
            style={{ borderColor: '#E2D9C8', color: '#1A1A1A', backgroundColor: 'white' }}>
            {assunto}
          </p>
        </div>

        {destinatario && (
          <p className="font-lato text-xs" style={{ color: '#9B9B9B' }}>
            Para: {destinatario}
          </p>
        )}

        <div>
          <label className="label-ac">Prévia do Corpo</label>
          <div
            className="rounded p-3 text-sm font-lato whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto"
            style={{ backgroundColor: '#F9F6F1', border: '1px solid #E2D9C8', color: '#1A1A1A' }}>
            {conteudo}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded text-sm font-montserrat font-semibold border transition-colors"
            style={{ borderColor: '#E2D9C8', color: '#6B6B6B' }}>
            Cancelar
          </button>
          <button onClick={handleEnviar} disabled={enviando}
            className="flex-1 py-2.5 rounded text-sm font-montserrat font-semibold text-white
                       flex items-center justify-center gap-2 transition-colors"
            style={{ backgroundColor: '#5A1220' }}>
            {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {enviando ? 'Registrando...' : 'Registrar Envio'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Modal Registrar Evento ────────────────────────────────────
function ModalEvento({ onClose, onSalvar }: {
  onClose: () => void
  onSalvar: (tipo: string, descricao: string) => Promise<void>
}) {
  const [tipo, setTipo]         = useState('OUTRO')
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro]         = useState('')

  const handleSalvar = async () => {
    if (!descricao.trim()) { setErro('Descrição obrigatória.'); return }
    setSalvando(true)
    await onSalvar(tipo, descricao.trim())
    setSalvando(false)
    onClose()
  }

  return (
    <Modal titulo="Registrar Evento" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label-ac">Tipo de Evento</label>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="w-full border rounded px-3 py-2.5 text-sm font-lato bg-white
              focus:outline-none focus:ring-2 focus:ring-[#5A1220]"
            style={{ borderColor: '#E2D9C8', color: '#1A1A1A' }}>
            {TIPOS_EVENTO.map(t => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label-ac">Descrição <span style={{ color: '#5A1220' }}>*</span></label>
          <textarea
            value={descricao}
            onChange={e => { setDescricao(e.target.value); setErro('') }}
            rows={4}
            placeholder="Descreva o evento, decisão, diligência ou comunicação registrada..."
            className="w-full border rounded px-3 py-2.5 text-sm font-lato bg-white resize-none
              focus:outline-none focus:ring-2 focus:ring-[#5A1220]"
            style={{ borderColor: erro ? '#FECACA' : '#E2D9C8', color: '#1A1A1A' }}
          />
          {erro && <p className="mt-1 font-lato text-xs" style={{ color: '#991B1B' }}>{erro}</p>}
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded text-sm font-montserrat font-semibold border"
            style={{ borderColor: '#E2D9C8', color: '#6B6B6B' }}>
            Cancelar
          </button>
          <button onClick={handleSalvar} disabled={salvando}
            className="flex-1 py-2.5 rounded text-sm font-montserrat font-semibold text-white
                       flex items-center justify-center gap-2"
            style={{ backgroundColor: '#5A1220' }}>
            {salvando ? <Loader2 size={15} className="animate-spin" /> : null}
            {salvando ? 'Salvando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Componente principal ──────────────────────────────────────
type ModalAberto = 'wa' | 'email' | 'evento' | null

interface Props {
  caso:               CasoCompleto
  onEnviarWA:         (template: string, conteudo: string) => Promise<void>
  onEnviarEmail:      (template: string, destinatario: string, conteudo: string) => Promise<void>
  onRegistrarEvento:  (tipo: string, descricao: string) => Promise<void>
  onSalvarPDF:        (nome: string, url: string) => Promise<void>
}

export default function PainelAcoes({ caso, onEnviarWA, onEnviarEmail, onRegistrarEvento, onSalvarPDF }: Props) {
  const [modal, setModal]       = useState<ModalAberto>(null)
  const [gerandoPDF, setGerando] = useState(false)

  const handleGerarPDF = async () => {
    setGerando(true)
    try {
      const dados = gerarNotificacaoExtrajudicial(caso)
      const nome  = `notificacao_${caso.titulo.devedor.nome.replace(/\s+/g, '_')}_${Date.now()}.pdf`
      downloadPDF(dados, nome)
      await onSalvarPDF(nome, `[download-local]/${nome}`)
    } finally {
      setGerando(false)
    }
  }

  const acoes = [
    {
      id: 'wa',
      label: 'WhatsApp',
      desc:  'Template pré-aprovado',
      icon:  MessageCircle,
      bg:    '#25D366',
      onClick: () => setModal('wa'),
    },
    {
      id: 'email',
      label: 'E-mail',
      desc:  'Notificação formal',
      icon:  Mail,
      bg:    '#5A1220',
      onClick: () => setModal('email'),
    },
    {
      id: 'evento',
      label: 'Registrar Evento',
      desc:  'Log cronológico',
      icon:  FilePlus,
      bg:    '#0E1B2A',
      onClick: () => setModal('evento'),
    },
    {
      id: 'pdf',
      label: 'Gerar PDF',
      desc:  'Notificação extrajudicial',
      icon:  FileDown,
      bg:    '#B79A5A',
      onClick: handleGerarPDF,
    },
  ] as const

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {acoes.map(a => {
          const Icon    = a.icon
          const loading = a.id === 'pdf' && gerandoPDF
          return (
            <button
              key={a.id}
              onClick={a.onClick}
              disabled={loading}
              className="flex flex-col items-center gap-2 py-4 px-3 rounded-lg border
                         transition-all hover:shadow-md active:scale-95 disabled:opacity-60
                         disabled:cursor-not-allowed group"
              style={{ borderColor: '#E2D9C8', backgroundColor: 'white' }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center
                           transition-transform group-hover:scale-110"
                style={{ backgroundColor: a.bg }}
              >
                {loading
                  ? <Loader2 size={18} color="white" className="animate-spin" />
                  : <Icon size={18} color="white" />}
              </div>
              <div className="text-center">
                <p className="font-montserrat text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  {a.label}
                </p>
                <p className="font-lato text-[10px]" style={{ color: '#9B9B9B' }}>
                  {loading ? 'Gerando...' : a.desc}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Modais */}
      {modal === 'wa' && (
        <ModalWhatsApp caso={caso} onClose={() => setModal(null)} onEnviar={onEnviarWA} />
      )}
      {modal === 'email' && (
        <ModalEmail caso={caso} onClose={() => setModal(null)} onEnviar={onEnviarEmail} />
      )}
      {modal === 'evento' && (
        <ModalEvento onClose={() => setModal(null)} onSalvar={onRegistrarEvento} />
      )}
    </>
  )
}
