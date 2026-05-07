/**
 * PainelPagamento — Módulo VINDEX de cobranças integradas.
 *
 * 3 abas: PIX | BOLETO | LINK DE PAGAMENTO
 * Gateway: iugu. Identidade: VINDEX (#0E1B2A / #B79A5A).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  QrCode, FileText, Link2, Copy, Check, Download,
  Loader2, CheckCircle2, Clock, XCircle, RefreshCw,
  Share2, Printer, AlertTriangle, ChevronDown,
} from 'lucide-react'

import { usePagamentos } from '@/hooks/cobranca/usePagamentos'
import { consultarStatusPix, type PixStatus } from '@/lib/pagamentos/pix'
import { montarUrlWhatsAppLink } from '@/lib/pagamentos/linkPagamento'
import { formatarMoeda } from '@/lib/utils'
import type { CasoCompleto } from '@/hooks/cobranca/useFichaCaso'
import { format, parseISO, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ── Constantes de identidade VINDEX ──────────────────────────
const V = {
  fundo:    '#0E1B2A',
  primario: '#5A1220',
  ouro:     '#B79A5A',
  ouro2:    '#D4AF7A',
  cinza:    '#8D9BAA',
  borda:    '#1E3248',
  card:     '#132030',
  verde:    '#2d5a2d',
  amarelo:  '#5a4a00',
  vermelho: '#5a0000',
}

// ── Tipos internos ────────────────────────────────────────────

type Aba = 'pix' | 'boleto' | 'link'

interface Props {
  caso: CasoCompleto
}

// ── Componentes auxiliares ────────────────────────────────────

function CopiarBtn({ texto, label = 'Copiar' }: { texto: string; label?: string }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = () => {
    void navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }
  return (
    <button
      onClick={copiar}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-montserrat font-semibold transition-all"
      style={{
        backgroundColor: copiado ? V.verde : V.borda,
        color: copiado ? '#86EFAC' : V.ouro,
        border: `1px solid ${copiado ? '#2d5a2d' : V.borda}`,
      }}
    >
      {copiado ? <Check size={12} /> : <Copy size={12} />}
      {copiado ? 'Copiado!' : label}
    </button>
  )
}

function StatusBadge({ status }: { status: PixStatus | 'pendente' | 'pago' | 'vencido' | 'cancelado' | 'desconhecido' }) {
  const cfg = {
    pendente:     { cor: V.amarelo, texto: '#FCD34D', label: 'Aguardando', icon: Clock },
    pago:         { cor: V.verde,   texto: '#86EFAC', label: 'Pago',       icon: CheckCircle2 },
    expirado:     { cor: V.vermelho,texto: '#FCA5A5', label: 'Expirado',   icon: XCircle },
    vencido:      { cor: V.vermelho,texto: '#FCA5A5', label: 'Vencido',    icon: XCircle },
    cancelado:    { cor: '#2a2a2a', texto: '#9B9B9B', label: 'Cancelado',  icon: XCircle },
    desconhecido: { cor: '#2a2a2a', texto: '#9B9B9B', label: 'Desconhecido', icon: AlertTriangle },
  }[status] ?? { cor: '#2a2a2a', texto: '#9B9B9B', label: status, icon: AlertTriangle }

  const Icon = cfg.icon
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-montserrat font-semibold"
      style={{ backgroundColor: cfg.cor, color: cfg.texto }}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  )
}

function CardVindex({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-4 ${className}`}
      style={{ backgroundColor: V.card, border: `1px solid ${V.borda}` }}
    >
      {children}
    </div>
  )
}

function InputVindex({
  label, value, onChange, type = 'text', min, max, placeholder, readOnly,
}: {
  label: string; value: string | number; onChange?: (v: string) => void
  type?: string; min?: string; max?: string; placeholder?: string; readOnly?: boolean
}) {
  return (
    <div>
      <label className="block text-[10px] font-montserrat font-semibold uppercase mb-1" style={{ color: V.cinza }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        min={min}
        max={max}
        placeholder={placeholder}
        readOnly={readOnly}
        className="w-full px-3 py-2 rounded-lg text-sm font-lato outline-none transition-colors"
        style={{
          backgroundColor: readOnly ? '#0A1520' : '#0D1E30',
          border: `1px solid ${V.borda}`,
          color: readOnly ? V.cinza : '#E2D9C8',
        }}
      />
    </div>
  )
}

function BotaoPrimario({
  onClick, loading, disabled, children, cor = V.primario,
}: {
  onClick?: () => void; loading?: boolean; disabled?: boolean
  children: React.ReactNode; cor?: string
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-montserrat font-bold transition-all disabled:opacity-40"
      style={{ backgroundColor: hover ? V.ouro : cor, color: hover ? V.fundo : '#FFFFFF' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

// ── Modal base ────────────────────────────────────────────────

function ModalVindex({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: V.card, border: `1px solid ${V.borda}` }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// ── Aba PIX ───────────────────────────────────────────────────

function AbaPix({ caso }: { caso: CasoCompleto }) {
  const { gerarPix, gerandoPix, pagamentos, refetch } = usePagamentos(caso.id)

  const [valor,      setValor]      = useState('')
  const [diasVenc,   setDiasVenc]   = useState(3)
  const [splitPct,   setSplitPct]   = useState(20)
  const [resultado,  setResultado]  = useState<{ qrcode?: string; copia_e_cola?: string; id_fatura?: string; cobranca_id?: string } | null>(null)
  const [pixStatus,  setPixStatus]  = useState<PixStatus>('pendente')
  const [erro,       setErro]       = useState('')
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Polling de status a cada 10s
  const iniciarPolling = useCallback((id_fatura: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      const status = await consultarStatusPix(id_fatura)
      setPixStatus(status)
      if (status === 'pago' || status === 'cancelado' || status === 'expirado') {
        clearInterval(pollingRef.current!)
        if (status === 'pago') refetch()
      }
    }, 10_000)
  }, [refetch])

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current) }, [])

  async function handleGerar() {
    setErro('')
    const valorNum = parseFloat(valor.replace(',', '.'))
    if (!valorNum || valorNum <= 0) return setErro('Informe um valor válido.')

    const res = await gerarPix({
      valor_centavos:       Math.round(valorNum * 100),
      vencimento_dias:      diasVenc,
      split_escritorio_pct: splitPct,
      devedor: {
        nome:     caso.titulo.devedor.nome,
        cpf_cnpj: '',    // descriptografado na Edge Function / preencher com dado real
        email:    caso.titulo.devedor.emails?.[0] ?? '',
      },
      descricao: `Cobrança — ${caso.titulo.devedor.nome}`,
    })

    if (!res.sucesso) return setErro(res.erro ?? 'Erro ao gerar Pix.')
    setResultado({
      qrcode:       res.qrcode_base64,
      copia_e_cola: res.copia_e_cola,
      id_fatura:    res.id_fatura,
      cobranca_id:  res.cobranca_id,
    })
    setPixStatus('pendente')
    if (res.id_fatura) iniciarPolling(res.id_fatura)
  }

  const pago = pixStatus === 'pago'

  return (
    <div className="space-y-4">
      <CardVindex>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <InputVindex
            label="Valor (R$)"
            value={valor}
            onChange={setValor}
            type="text"
            placeholder="0,00"
          />
          <div>
            <label className="block text-[10px] font-montserrat font-semibold uppercase mb-1" style={{ color: V.cinza }}>
              Vencimento — {diasVenc} dia{diasVenc > 1 ? 's' : ''}
            </label>
            <input
              type="range" min={1} max={7} value={diasVenc}
              onChange={e => setDiasVenc(Number(e.target.value))}
              className="w-full accent-yellow-500 mt-2"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-[10px] font-montserrat font-semibold uppercase mb-1" style={{ color: V.cinza }}>
            Split honorários — {splitPct}% escritório / {100 - splitPct}% credor
          </label>
          <input
            type="range" min={0} max={50} step={5} value={splitPct}
            onChange={e => setSplitPct(Number(e.target.value))}
            className="w-full accent-yellow-500"
          />
          {valor && (
            <p className="font-lato text-[10px] mt-1" style={{ color: V.cinza }}>
              {formatarMoeda(parseFloat(valor.replace(',','.') || '0') * splitPct / 100)} escritório ·{' '}
              {formatarMoeda(parseFloat(valor.replace(',','.') || '0') * (100 - splitPct) / 100)} credor
            </p>
          )}
        </div>

        {erro && (
          <p className="text-xs font-lato mb-3" style={{ color: '#FCA5A5' }}>{erro}</p>
        )}

        <BotaoPrimario onClick={() => void handleGerar()} loading={gerandoPix}>
          <QrCode size={15} />
          Gerar QR Code Pix
        </BotaoPrimario>
      </CardVindex>

      {/* Modal com resultado */}
      {resultado && (
        <ModalVindex onClose={() => setResultado(null)}>
          {/* Header do modal */}
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${V.borda}` }}>
            <div className="flex items-center gap-2">
              <QrCode size={16} style={{ color: V.ouro }} />
              <span className="font-cinzel font-bold text-sm" style={{ color: V.ouro }}>PIX — QR Code</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={pixStatus} />
              {!pago && (
                <button
                  onClick={async () => {
                    if (resultado.id_fatura) {
                      const s = await consultarStatusPix(resultado.id_fatura)
                      setPixStatus(s)
                    }
                  }}
                  className="p-1 rounded"
                  style={{ color: V.cinza }}
                  title="Atualizar status"
                >
                  <RefreshCw size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="px-5 py-4 space-y-4">
            {pago ? (
              /* Estado: Pago — Celebração */
              <div className="flex flex-col items-center py-4">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
                  style={{ backgroundColor: V.verde }}
                >
                  <CheckCircle2 size={36} style={{ color: '#86EFAC' }} />
                </div>
                <p className="font-cinzel font-bold text-lg" style={{ color: '#86EFAC' }}>
                  Pagamento Confirmado
                </p>
                <p className="font-lato text-xs mt-1" style={{ color: V.cinza }}>
                  Caso e timeline atualizados automaticamente.
                </p>
              </div>
            ) : (
              <>
                {/* QR Code */}
                {resultado.qrcode && (
                  <div className="flex justify-center">
                    <div className="p-3 rounded-xl" style={{ backgroundColor: '#FFFFFF' }}>
                      <img
                        src={`data:image/png;base64,${resultado.qrcode}`}
                        alt="QR Code Pix"
                        className="w-48 h-48"
                      />
                    </div>
                  </div>
                )}

                {/* Copia e Cola */}
                {resultado.copia_e_cola && (
                  <div>
                    <label className="block text-[10px] font-montserrat font-semibold uppercase mb-1" style={{ color: V.cinza }}>
                      Pix Copia e Cola
                    </label>
                    <div
                      className="px-3 py-2 rounded-lg font-mono text-[10px] break-all mb-2"
                      style={{ backgroundColor: '#0A1520', color: V.cinza, border: `1px solid ${V.borda}` }}
                    >
                      {resultado.copia_e_cola.slice(0, 80)}…
                    </div>
                    <CopiarBtn texto={resultado.copia_e_cola} label="Copiar código Pix" />
                  </div>
                )}

                <p className="text-[10px] font-lato text-center" style={{ color: V.cinza }}>
                  Status atualizado automaticamente a cada 10 segundos
                </p>
              </>
            )}
          </div>
        </ModalVindex>
      )}

      {/* Histórico Pix */}
      {pagamentos.filter(p => p.tipo_pagamento === 'pix').length > 0 && (
        <HistoricoPagamentos
          pagamentos={pagamentos.filter(p => p.tipo_pagamento === 'pix')}
        />
      )}
    </div>
  )
}

// ── Aba BOLETO ────────────────────────────────────────────────

function AbaBoleto({ caso }: { caso: CasoCompleto }) {
  const { emitirBoleto: emitir, emitindoBoleto, pagamentos } = usePagamentos(caso.id)

  const devedor = caso.titulo.devedor
  const enderecoStr = devedor.enderecos?.[0] ?? ''

  const [valor,    setValor]    = useState('')
  const [dataVenc, setDataVenc] = useState(
    format(addDays(new Date(), 3), 'yyyy-MM-dd'),
  )
  const [resultado, setResultado] = useState<{
    linha_digitavel?: string; url_pdf?: string; codigo_de_barras?: string
  } | null>(null)
  const [erro, setErro] = useState('')

  async function handleEmitir() {
    setErro('')
    const valorNum = parseFloat(valor.replace(',', '.'))
    if (!valorNum || valorNum <= 0) return setErro('Informe um valor válido.')

    const res = await emitir({
      valor_centavos:       Math.round(valorNum * 100),
      data_vencimento:      new Date(dataVenc + 'T12:00:00'),
      split_escritorio_pct: 20,
      enviar_email:         true,
      enviar_whatsapp:      devedor.contatavel_whatsapp === 'sim',
      devedor: {
        nome:     devedor.nome,
        cpf_cnpj: '',
        email:    devedor.emails?.[0] ?? '',
        telefone: devedor.telefones?.[0],
        endereco: {
          logradouro: enderecoStr || 'A confirmar',
          numero:     'S/N',
          bairro:     '',
          cidade:     '',
          estado:     '',
          cep:        '',
        },
      },
      descricao: `Cobrança — ${devedor.nome}`,
    })

    if (!res.sucesso) return setErro(res.erro ?? 'Erro ao emitir boleto.')
    setResultado({
      linha_digitavel:  res.linha_digitavel,
      url_pdf:          res.url_pdf_storage ?? res.url_pdf,
      codigo_de_barras: res.codigo_de_barras,
    })
  }

  return (
    <div className="space-y-4">
      <CardVindex>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <InputVindex
            label="Valor (R$)"
            value={valor}
            onChange={setValor}
            placeholder="0,00"
          />
          <InputVindex
            label="Vencimento (mín D+2)"
            type="date"
            value={dataVenc}
            onChange={setDataVenc}
            min={format(addDays(new Date(), 2), 'yyyy-MM-dd')}
          />
        </div>

        <div className="mb-4 rounded-lg px-3 py-2.5" style={{ backgroundColor: '#0A1520', border: `1px solid ${V.borda}` }}>
          <p className="text-[10px] font-montserrat uppercase font-semibold mb-1" style={{ color: V.cinza }}>Devedor</p>
          <p className="font-lato text-sm" style={{ color: '#E2D9C8' }}>{devedor.nome}</p>
          <p className="font-lato text-xs mt-0.5" style={{ color: V.cinza }}>
            {devedor.emails?.[0] ?? 'E-mail não cadastrado'}
          </p>
          {devedor.enderecos?.[0] && (
            <p className="font-lato text-xs mt-0.5" style={{ color: V.cinza }}>
              {devedor.enderecos[0]}
            </p>
          )}
        </div>

        <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: '#0a1a10', border: '1px solid #1a3a1a' }}>
          <AlertTriangle size={12} style={{ color: '#86EFAC', flexShrink: 0, marginTop: 2 }} />
          <p className="font-lato text-[10px]" style={{ color: '#86EFAC' }}>
            Vencimento mínimo D+2 (FEBRABAN). PDF salvo automaticamente no Storage do caso.
            E-mail enviado ao devedor após emissão.
          </p>
        </div>

        {erro && <p className="text-xs font-lato mb-3" style={{ color: '#FCA5A5' }}>{erro}</p>}

        <BotaoPrimario onClick={() => void handleEmitir()} loading={emitindoBoleto}>
          <FileText size={15} />
          Emitir Boleto
        </BotaoPrimario>
      </CardVindex>

      {/* Modal resultado */}
      {resultado && (
        <ModalVindex onClose={() => setResultado(null)}>
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${V.borda}` }}>
            <span className="font-cinzel font-bold text-sm" style={{ color: V.ouro }}>
              Boleto Emitido
            </span>
          </div>
          <div className="px-5 py-4 space-y-4">
            {resultado.linha_digitavel && (
              <div>
                <p className="text-[10px] font-montserrat uppercase font-semibold mb-1" style={{ color: V.cinza }}>
                  Linha Digitável
                </p>
                <p className="font-mono text-xs break-all mb-2" style={{ color: '#E2D9C8' }}>
                  {resultado.linha_digitavel}
                </p>
                <CopiarBtn texto={resultado.linha_digitavel} label="Copiar linha digitável" />
              </div>
            )}
            {resultado.url_pdf && (
              <a
                href={resultado.url_pdf}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full py-2.5 px-4 rounded-lg text-sm font-montserrat font-bold justify-center transition-colors"
                style={{ backgroundColor: V.primario, color: '#FFFFFF' }}
              >
                <Download size={14} />
                Baixar PDF do Boleto
              </a>
            )}
          </div>
        </ModalVindex>
      )}

      {pagamentos.filter(p => p.tipo_pagamento === 'boleto').length > 0 && (
        <HistoricoPagamentos pagamentos={pagamentos.filter(p => p.tipo_pagamento === 'boleto')} />
      )}
    </div>
  )
}

// ── Aba LINK DE PAGAMENTO ─────────────────────────────────────

function AbaLink({ caso }: { caso: CasoCompleto }) {
  const { gerarLink, gerandoLink, pagamentos } = usePagamentos(caso.id)

  const [valor,      setValor]      = useState('')
  const [expiracao,  setExpiracao]  = useState<48 | 72 | 168>(48)
  const [resultado,  setResultado]  = useState<{ url?: string; expira_em?: string } | null>(null)
  const [erro,       setErro]       = useState('')

  async function handleGerar() {
    setErro('')
    const valorNum = parseFloat(valor.replace(',', '.'))
    if (!valorNum || valorNum <= 0) return setErro('Informe um valor válido.')

    const res = await gerarLink({
      valor_centavos:       Math.round(valorNum * 100),
      descricao:            `Cobrança — ${caso.titulo.devedor.nome}`,
      expiracao_horas:      expiracao,
      split_escritorio_pct: 20,
    })

    if (!res.sucesso) return setErro(res.erro ?? 'Erro ao gerar link.')
    setResultado({ url: res.url, expira_em: res.expira_em })
  }

  const devedor = caso.titulo.devedor
  const telDevedor = devedor.telefones?.[0] ?? ''

  return (
    <div className="space-y-4">
      <CardVindex>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <InputVindex
            label="Valor (R$)"
            value={valor}
            onChange={setValor}
            placeholder="0,00"
          />
          <div>
            <label className="block text-[10px] font-montserrat font-semibold uppercase mb-1" style={{ color: V.cinza }}>
              Expiração do link
            </label>
            <select
              value={expiracao}
              onChange={e => setExpiracao(Number(e.target.value) as 48 | 72 | 168)}
              className="w-full px-3 py-2 rounded-lg text-sm font-lato outline-none"
              style={{ backgroundColor: '#0D1E30', border: `1px solid ${V.borda}`, color: '#E2D9C8' }}
            >
              <option value={48}>48 horas</option>
              <option value={72}>72 horas</option>
              <option value={168}>7 dias</option>
            </select>
          </div>
        </div>

        <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: '#0A1520', border: `1px solid ${V.borda}` }}>
          <p className="font-lato text-[10px]" style={{ color: V.cinza }}>
            O link aceita <strong style={{ color: V.ouro }}>Pix · Boleto · Cartão</strong> em uma única página.
            Parcelamento em até 12×.
          </p>
        </div>

        {erro && <p className="text-xs font-lato mb-3" style={{ color: '#FCA5A5' }}>{erro}</p>}

        <BotaoPrimario onClick={() => void handleGerar()} loading={gerandoLink}>
          <Link2 size={15} />
          Gerar Link de Pagamento
        </BotaoPrimario>
      </CardVindex>

      {resultado?.url && (
        <ModalVindex onClose={() => setResultado(null)}>
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${V.borda}` }}>
            <span className="font-cinzel font-bold text-sm" style={{ color: V.ouro }}>
              Link Gerado
            </span>
            {resultado.expira_em && (
              <p className="font-lato text-[10px] mt-0.5" style={{ color: V.cinza }}>
                Expira em {format(parseISO(resultado.expira_em), "dd/MM HH'h'", { locale: ptBR })}
              </p>
            )}
          </div>

          <div className="px-5 py-4 space-y-3">
            {/* URL */}
            <div
              className="px-3 py-2 rounded-lg font-mono text-xs break-all"
              style={{ backgroundColor: '#0A1520', color: V.ouro2, border: `1px solid ${V.borda}` }}
            >
              {resultado.url}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <CopiarBtn texto={resultado.url} label="Copiar URL" />

              <a
                href={resultado.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-montserrat font-semibold justify-center"
                style={{ backgroundColor: V.borda, color: V.ouro, border: `1px solid ${V.borda}` }}
              >
                <Printer size={12} />
                Abrir
              </a>
            </div>

            {/* Botão WhatsApp */}
            {telDevedor && (
              <a
                href={montarUrlWhatsAppLink(
                  telDevedor,
                  resultado.url,
                  devedor.nome,
                  formatarMoeda(parseFloat(valor.replace(',', '.') || '0')),
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full py-2.5 px-4 rounded-lg text-sm font-montserrat font-bold justify-center"
                style={{ backgroundColor: '#25D366', color: '#FFFFFF' }}
              >
                <Share2 size={14} />
                Compartilhar no WhatsApp
              </a>
            )}
          </div>
        </ModalVindex>
      )}

      {pagamentos.filter(p => p.tipo_pagamento === 'link').length > 0 && (
        <HistoricoPagamentos pagamentos={pagamentos.filter(p => p.tipo_pagamento === 'link')} />
      )}
    </div>
  )
}

// ── Histórico de pagamentos ───────────────────────────────────

function HistoricoPagamentos({
  pagamentos,
}: {
  pagamentos: { id: string; valor_total: number; status: string; data_vencimento: string; data_pagamento: string | null }[]
}) {
  const [expandido, setExpandido] = useState(false)
  const visiveis = expandido ? pagamentos : pagamentos.slice(0, 3)

  return (
    <CardVindex>
      <p className="text-[10px] font-montserrat uppercase font-semibold mb-2" style={{ color: V.cinza }}>
        Histórico ({pagamentos.length})
      </p>
      <div className="space-y-1.5">
        {visiveis.map(p => (
          <div
            key={p.id}
            className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{ backgroundColor: '#0A1520' }}
          >
            <div>
              <p className="font-montserrat text-sm font-semibold" style={{ color: '#E2D9C8' }}>
                {formatarMoeda(p.valor_total)}
              </p>
              <p className="font-lato text-[10px]" style={{ color: V.cinza }}>
                Venc: {format(parseISO(p.data_vencimento), 'dd/MM/yyyy')}
                {p.data_pagamento && ` · Pago: ${format(parseISO(p.data_pagamento), 'dd/MM/yyyy')}`}
              </p>
            </div>
            <StatusBadge status={p.status as 'pendente' | 'pago' | 'vencido' | 'cancelado'} />
          </div>
        ))}
      </div>
      {pagamentos.length > 3 && (
        <button
          onClick={() => setExpandido(e => !e)}
          className="flex items-center gap-1 mt-2 text-[10px] font-montserrat font-semibold"
          style={{ color: V.ouro }}
        >
          <ChevronDown size={12} className={expandido ? 'rotate-180' : ''} />
          {expandido ? 'Ver menos' : `Ver mais ${pagamentos.length - 3} registros`}
        </button>
      )}
    </CardVindex>
  )
}

// ── Painel resumo financeiro ──────────────────────────────────

function ResumoFinanceiro({ caso_id }: { caso_id: string }) {
  const { totais, isLoading } = usePagamentos(caso_id)

  if (isLoading) return null

  return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      {[
        { label: 'Recebido',  valor: totais.total_recebido,  cor: V.verde   },
        { label: 'Pendente',  valor: totais.total_pendente,  cor: V.amarelo },
        { label: 'Vencido',   valor: totais.total_vencido,   cor: V.vermelho},
      ].map(({ label, valor, cor }) => (
        <div key={label} className="rounded-lg px-3 py-2" style={{ backgroundColor: cor, opacity: 0.85 }}>
          <p className="font-lato text-[9px] uppercase font-bold" style={{ color: '#E2D9C8' }}>{label}</p>
          <p className="font-montserrat text-sm font-bold" style={{ color: '#FFFFFF' }}>
            {formatarMoeda(valor)}
          </p>
        </div>
      ))}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────

export default function PainelPagamento({ caso }: Props) {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('pix')

  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'pix',    label: 'PIX',             icon: QrCode   },
    { id: 'boleto', label: 'BOLETO',           icon: FileText },
    { id: 'link',   label: 'LINK',             icon: Link2    },
  ]

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${V.borda}` }}>
      {/* ── Header VINDEX ─────────────────────────────────────── */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ backgroundColor: V.fundo }}
      >
        <div>
          <h3 className="font-cinzel font-bold text-lg tracking-widest" style={{ color: V.ouro }}>
            VINDEX
          </h3>
          <p className="font-lato text-[10px] uppercase tracking-wider mt-0.5" style={{ color: V.cinza }}>
            Gestão Financeira · Cobranças Integradas
          </p>
        </div>
        <div className="text-right">
          <p className="font-lato text-[10px]" style={{ color: V.cinza }}>
            {caso.titulo.devedor.nome.split(' ')[0]}
          </p>
          <p className="font-montserrat text-xs font-semibold" style={{ color: V.ouro2 }}>
            {formatarMoeda(caso.titulo.valor_atualizado)}
          </p>
        </div>
      </div>

      {/* ── Abas ─────────────────────────────────────────────── */}
      <div
        className="flex"
        style={{ backgroundColor: '#0A1520', borderBottom: `1px solid ${V.borda}` }}
      >
        {abas.map(({ id, label, icon: Icon }) => {
          const ativa = abaAtiva === id
          return (
            <button
              key={id}
              onClick={() => setAbaAtiva(id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-montserrat font-bold uppercase tracking-wider transition-all"
              style={{
                backgroundColor:  ativa ? V.card : 'transparent',
                color:            ativa ? V.ouro : V.cinza,
                borderBottom:     ativa ? `2px solid ${V.ouro}` : '2px solid transparent',
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Conteúdo ─────────────────────────────────────────── */}
      <div className="p-4" style={{ backgroundColor: V.fundo }}>
        <ResumoFinanceiro caso_id={caso.id} />

        {abaAtiva === 'pix'    && <AbaPix    caso={caso} />}
        {abaAtiva === 'boleto' && <AbaBoleto caso={caso} />}
        {abaAtiva === 'link'   && <AbaLink   caso={caso} />}
      </div>
    </div>
  )
}
