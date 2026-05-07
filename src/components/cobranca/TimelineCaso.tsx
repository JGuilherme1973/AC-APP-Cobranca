/**
 * TimelineCaso — Linha do tempo cronológica invertida (mais recente no topo).
 * Ícone e cor variam por tipo de evento.
 */

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  FolderOpen, MessageSquare, DollarSign, Scale,
  CheckSquare, FileText, Handshake,
  XCircle, Activity,
} from 'lucide-react'
import type { EventoTimeline } from '@/hooks/cobranca/useFichaCaso'

type TipoEvento = string

interface EventoCfg {
  icon:  React.ElementType
  bg:    string
  text:  string
  label: string
}

const EVENTO_CFG: Record<string, EventoCfg> = {
  ABERTURA_CASO:       { icon: FolderOpen,    bg: '#0D1B2A', text: '#B89C5C', label: 'Abertura do Caso' },
  COMUNICACAO_ENVIADA: { icon: MessageSquare, bg: '#1E3A5F', text: '#93C5FD', label: 'Comunicação Enviada' },
  RESPOSTA_RECEBIDA:   { icon: MessageSquare, bg: '#14532D', text: '#86EFAC', label: 'Resposta Recebida' },
  PAGAMENTO_PARCIAL:   { icon: DollarSign,    bg: '#14532D', text: '#86EFAC', label: 'Pagamento Parcial' },
  DISTRIBUICAO_ACAO:   { icon: Scale,         bg: '#5A1E2A', text: '#FCA5A5', label: 'Distribuição de Ação' },
  DECISAO_JUDICIAL:    { icon: Scale,         bg: '#5A1E2A', text: '#FCA5A5', label: 'Decisão Judicial' },
  PENHORA_EFETIVADA:   { icon: CheckSquare,   bg: '#92400E', text: '#FCD34D', label: 'Penhora Efetivada' },
  ACORDO_FECHADO:      { icon: Handshake,     bg: '#14532D', text: '#86EFAC', label: 'Acordo Fechado' },
  ENCERRAMENTO_CASO:   { icon: XCircle,       bg: '#374151', text: '#D1D5DB', label: 'Encerramento do Caso' },
  OUTRO:               { icon: FileText,      bg: '#374151', text: '#D1D5DB', label: 'Registro' },
}

function getCfg(tipo: TipoEvento): EventoCfg {
  return EVENTO_CFG[tipo] ?? EVENTO_CFG['OUTRO']
}

interface Props {
  eventos: EventoTimeline[]
  loading?: boolean
}

export default function TimelineCaso({ eventos, loading }: Props) {
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-8 h-8 rounded-full animate-pulse flex-shrink-0"
              style={{ backgroundColor: '#E2D9C8' }} />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3.5 rounded w-48 animate-pulse" style={{ backgroundColor: '#E2D9C8' }} />
              <div className="h-3 rounded w-72 animate-pulse" style={{ backgroundColor: '#F0EBE0' }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (eventos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <Activity size={28} style={{ color: '#C0C0C0' }} />
        <p className="font-lato text-sm" style={{ color: '#9B9B9B' }}>
          Nenhum evento registrado ainda.
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Linha vertical da timeline */}
      <div
        className="absolute left-4 top-0 bottom-0 w-0.5"
        style={{ backgroundColor: '#E2D9C8' }}
        aria-hidden="true"
      />

      <div className="space-y-1">
        {eventos.map((evento, i) => {
          const cfg  = getCfg(evento.tipo_evento)
          const Icon = cfg.icon
          const isFirst = i === 0

          return (
            <div key={evento.id} className="flex gap-4 group">
              {/* Ícone */}
              <div className="relative z-10 flex-shrink-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center
                             shadow-sm transition-transform group-hover:scale-110"
                  style={{ backgroundColor: cfg.bg }}
                >
                  <Icon size={14} color={cfg.text} />
                </div>
                {isFirst && (
                  <span
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2"
                    style={{ backgroundColor: '#B89C5C', borderColor: '#FAFAF8' }}
                    title="Evento mais recente"
                  />
                )}
              </div>

              {/* Conteúdo */}
              <div
                className="flex-1 pb-5 min-w-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className="font-montserrat text-xs font-semibold uppercase tracking-wide"
                      style={{ color: '#9B9B9B' }}
                    >
                      {cfg.label}
                    </p>
                    <p
                      className="font-lato text-sm mt-0.5 leading-relaxed"
                      style={{ color: '#1A1A1A' }}
                    >
                      {evento.descricao}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p
                      className="font-montserrat text-[10px] font-semibold whitespace-nowrap"
                      style={{ color: '#9B9B9B' }}
                    >
                      {format(parseISO(evento.data_evento), "dd/MM/yy", { locale: ptBR })}
                    </p>
                    <p
                      className="font-lato text-[10px] whitespace-nowrap"
                      style={{ color: '#C0C0C0' }}
                    >
                      {format(parseISO(evento.data_evento), "HH:mm", { locale: ptBR })}
                    </p>
                    {evento.usuario?.nome && (
                      <p
                        className="font-lato text-[10px] whitespace-nowrap"
                        style={{ color: '#C0C0C0' }}
                      >
                        {evento.usuario.nome.split(' ')[0]}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
