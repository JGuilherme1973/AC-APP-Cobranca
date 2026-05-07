/**
 * PortalNegociacao — Portal self-service de renegociação de dívidas.
 *
 * Rota pública: /negociar/:token
 * Sem autenticação Supabase — acesso controlado por token UUID na URL.
 * Gerado automaticamente pela régua (step D+7, template 'proposta_acordo').
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, Shield, FileText, Loader2, Download } from 'lucide-react'
import { format, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { gerarConfissaoDivida, downloadConfissao } from '@/lib/regua/confissaoDivida'

// ── Tipos ──────────────────────────────────────────────────────

interface DadosCaso {
  id:               string
  devedor_nome:     string
  devedor_email:    string
  devedor_tel:      string
  credor_nome:      string
  advogado_nome:    string
  advogado_email:   string
  valor_original:   number
  valor_atualizado: number
  data_vencimento:  string
  data_origem:      string
  juros_mensais:    number
  multa_percentual: number
}

type Etapa = 'carregando' | 'exibindo' | 'confirmando' | 'concluido' | 'erro' | 'expirado' | 'usado'

// ── Helpers ────────────────────────────────────────────────────

const COR_NAVY  = '#0E1B2A'
const COR_OURO  = '#B79A5A'
const COR_VINHO = '#5A1220'

function fmt(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function calcularDesconto(valor: number, pct: number): number {
  return Math.round(valor * pct) / 100
}

// ── Tela: Carregando ───────────────────────────────────────────

function TelaCarregando() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ backgroundColor: COR_NAVY }}>
      <Loader2 size={40} className="animate-spin" style={{ color: COR_OURO }} />
      <p className="text-sm" style={{ color: '#9ca3af' }}>Verificando seu link…</p>
    </div>
  )
}

// ── Tela: Erro/Expirado/Usado ──────────────────────────────────

function TelaErro({ tipo, mensagem }: { tipo: 'erro' | 'expirado' | 'usado'; mensagem: string }) {
  const icone = tipo === 'usado'
    ? <CheckCircle2 size={48} style={{ color: COR_OURO }} />
    : <AlertTriangle size={48} style={{ color: '#ef4444' }} />

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-5 p-6 text-center" style={{ backgroundColor: COR_NAVY }}>
      {icone}
      <div>
        <h2 className="font-bold text-lg mb-2" style={{ color: tipo === 'usado' ? COR_OURO : '#f87171' }}>
          {tipo === 'expirado' ? 'Link Expirado'
           : tipo === 'usado'  ? 'Acordo Já Registrado'
           : 'Link Inválido'}
        </h2>
        <p className="text-sm max-w-sm" style={{ color: '#9ca3af' }}>{mensagem}</p>
      </div>
      <div
        className="mt-4 px-4 py-3 rounded-lg text-xs text-center max-w-sm"
        style={{ backgroundColor: '#0a1520', border: `1px solid ${COR_OURO}33`, color: '#9ca3af' }}
      >
        Em caso de dúvidas, entre em contato com o escritório:<br />
        <a href="mailto:jgac@cintraadvogados.com.br" style={{ color: COR_OURO }}>
          jgac@cintraadvogados.com.br
        </a>
      </div>
    </div>
  )
}

// ── Tela: Concluído ────────────────────────────────────────────

function TelaConcluido({ dados, acordoId, pdf }: { dados: DadosCaso; acordoId: string; pdf: ArrayBuffer | null }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-6 text-center" style={{ backgroundColor: COR_NAVY }}>
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ backgroundColor: '#14532d33', border: '2px solid #22c55e' }}
      >
        <CheckCircle2 size={40} style={{ color: '#22c55e' }} />
      </div>

      <div>
        <h2 className="font-bold text-xl mb-2" style={{ color: COR_OURO }}>
          Acordo Confirmado!
        </h2>
        <p className="text-sm" style={{ color: '#d1d5db' }}>
          Obrigado, <strong>{dados.devedor_nome}</strong>. Seu acordo foi registrado com sucesso.
        </p>
        <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
          Protocolo: {acordoId.slice(0, 8).toUpperCase()}
        </p>
      </div>

      <div
        className="w-full max-w-sm rounded-xl p-4 text-left text-sm"
        style={{ backgroundColor: '#0a1520', border: `1px solid ${COR_OURO}33` }}
      >
        <p className="text-xs font-medium mb-2" style={{ color: COR_OURO }}>Próximos Passos</p>
        <ul className="space-y-1.5 text-xs" style={{ color: '#9ca3af' }}>
          <li>• Em até 24h você receberá os boletos/link Pix por e-mail</li>
          <li>• Guarde o PDF da confissão de dívida como comprovante</li>
          <li>• Em caso de dúvidas: {dados.advogado_email}</li>
        </ul>
      </div>

      {pdf && (
        <button
          onClick={() => downloadConfissao(pdf, dados.devedor_nome)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors hover:opacity-80"
          style={{ backgroundColor: COR_OURO, color: COR_NAVY }}
        >
          <Download size={15} />
          Baixar Confissão de Dívida (PDF)
        </button>
      )}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────

export default function PortalNegociacao() {
  const { token } = useParams<{ token: string }>()

  const [etapa,     setEtapa]     = useState<Etapa>('carregando')
  const [dados,     setDados]     = useState<DadosCaso | null>(null)
  const [errMsg,    setErrMsg]    = useState('')
  const [acordoId,  setAcordoId]  = useState('')
  const [pdf,       setPdf]       = useState<ArrayBuffer | null>(null)
  const [loading,   setLoading]   = useState(false)

  // Opções de acordo
  const [tipoAcordo,   setTipoAcordo]   = useState<'avista' | 'parcelado'>('avista')
  const [numParcelas,  setNumParcelas]  = useState(3)
  const [pixAuto,      setPixAuto]      = useState(false)
  const [descontoPct,  setDescontoPct]  = useState(10)

  // ── Carregar dados do token ──────────────────────────────────

  const carregarToken = useCallback(async () => {
    if (!token) { setEtapa('erro'); setErrMsg('Token ausente na URL.'); return }

    try {
      const { data, error } = await supabase.functions.invoke('portal-negociar', {
        body: { action: 'validar_token', token },
      })

      if (error) throw new Error(error.message)

      const r = data as Record<string, unknown>
      if (!r.sucesso) {
        const msg = r.erro as string
        if (msg?.includes('expirou'))   { setEtapa('expirado'); setErrMsg(msg); return }
        if (msg?.includes('utilizado')) { setEtapa('usado');    setErrMsg(msg); return }
        setEtapa('erro'); setErrMsg(msg ?? 'Link inválido.'); return
      }

      setDados(r.caso as DadosCaso)
      setEtapa('exibindo')
    } catch (e) {
      setEtapa('erro')
      setErrMsg(e instanceof Error ? e.message : 'Erro ao verificar link.')
    }
  }, [token])

  useEffect(() => { carregarToken() }, [carregarToken])

  // ── Confirmar acordo ─────────────────────────────────────────

  const confirmarAcordo = async () => {
    if (!dados || !token) return
    setLoading(true)

    const valorDesconto = calcularDesconto(dados.valor_atualizado, descontoPct)
    const valorAcordo   = dados.valor_atualizado - valorDesconto
    const ip = await fetch('https://api.ipify.org?format=json')
      .then(r => r.json())
      .then((d: { ip: string }) => d.ip)
      .catch(() => 'desconhecido')

    try {
      const { data, error } = await supabase.functions.invoke('portal-negociar', {
        body: {
          action:          'criar_acordo',
          token,
          tipo:            tipoAcordo,
          valor_total:     dados.valor_atualizado,
          valor_desconto:  valorDesconto,
          numero_parcelas: tipoAcordo === 'avista' ? 1 : numParcelas,
          pix_automatico:  pixAuto,
          ip_cliente:      ip,
        },
      })

      if (error) throw new Error(error.message)

      const r = data as Record<string, unknown>
      if (!r.sucesso) throw new Error(r.erro as string)

      const id = r.acordo_id as string
      setAcordoId(id)

      // Gerar PDF confissão de dívida
      const pdfBuf = gerarConfissaoDivida({
        devedor_nome:      dados.devedor_nome,
        devedor_email:     dados.devedor_email,
        credor_nome:       dados.credor_nome,
        valor_original:    dados.valor_atualizado,
        valor_acordo:      valorAcordo,
        valor_desconto:    valorDesconto,
        numero_parcelas:   tipoAcordo === 'avista' ? 1 : numParcelas,
        data_vencimento_1: addDays(new Date(), 3).toISOString().split('T')[0],
        periodicidade:     'mensal',
        tipo_pagamento:    tipoAcordo,
        token,
        ip_devedor:        ip,
        data_aceite:       new Date(),
      })
      setPdf(pdfBuf)
      setEtapa('concluido')
    } catch (e) {
      setEtapa('erro')
      setErrMsg(e instanceof Error ? e.message : 'Erro ao registrar acordo.')
    } finally {
      setLoading(false)
    }
  }

  // ── Renders condicionais ─────────────────────────────────────

  if (etapa === 'carregando') return <TelaCarregando />
  if (etapa === 'erro')      return <TelaErro tipo="erro"     mensagem={errMsg} />
  if (etapa === 'expirado')  return <TelaErro tipo="expirado" mensagem={errMsg} />
  if (etapa === 'usado')     return <TelaErro tipo="usado"    mensagem={errMsg} />
  if (etapa === 'concluido' && dados) return <TelaConcluido dados={dados} acordoId={acordoId} pdf={pdf} />
  if (!dados) return <TelaCarregando />

  // ── Cálculos ──────────────────────────────────────────────────

  const valorDesconto = calcularDesconto(dados.valor_atualizado, descontoPct)
  const valorAcordo   = dados.valor_atualizado - valorDesconto
  const valorParcela  = tipoAcordo === 'parcelado' ? valorAcordo / numParcelas : valorAcordo
  const primeiroVenc  = format(addDays(new Date(), 3), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })

  // ── Render principal ──────────────────────────────────────────

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: COR_NAVY }}>

      {/* Header VINDEX */}
      <div style={{ backgroundColor: '#060e18', borderBottom: `2px solid ${COR_OURO}33` }}>
        <div className="max-w-lg mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <span className="font-bold text-lg tracking-widest" style={{ color: COR_OURO }}>VINDEX</span>
            <span className="text-xs ml-2" style={{ color: '#6b7280' }}>Portal de Renegociação</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#4ade80' }}>
            <Shield size={12} />
            Ambiente seguro
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-6 space-y-5">

        {/* Saudação */}
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: '#0a1520', border: `1px solid ${COR_OURO}33` }}
        >
          <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Olá,</p>
          <h1 className="font-bold text-lg" style={{ color: COR_OURO }}>{dados.devedor_nome}</h1>
          <p className="text-sm mt-2" style={{ color: '#9ca3af' }}>
            {dados.credor_nome} disponibilizou uma proposta especial para regularização do seu débito.
            Confira as condições e confirme seu acordo abaixo.
          </p>
        </div>

        {/* Resumo do débito */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: `1px solid ${COR_OURO}33` }}
        >
          <div className="px-4 py-3" style={{ backgroundColor: '#060e18' }}>
            <span className="text-xs font-medium" style={{ color: COR_OURO }}>Resumo do Débito</span>
          </div>
          <div className="divide-y divide-gray-800" style={{ backgroundColor: '#0a1520' }}>
            {[
              ['Credor',           dados.credor_nome],
              ['Valor original',   fmt(dados.valor_original)],
              ['Vencimento',       format(new Date(dados.data_vencimento + 'T12:00:00'), 'dd/MM/yyyy')],
              ['Valor atualizado', fmt(dados.valor_atualizado)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between px-4 py-2.5 text-sm">
                <span style={{ color: '#6b7280' }}>{k}</span>
                <span style={{ color: '#d1d5db' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Proposta */}
        <div
          className="rounded-xl p-5 space-y-4"
          style={{ backgroundColor: '#0a1520', border: `1px solid ${COR_OURO}33` }}
        >
          <p className="text-sm font-medium" style={{ color: COR_OURO }}>Monte sua Proposta</p>

          {/* Desconto */}
          <div>
            <div className="flex justify-between text-xs mb-1" style={{ color: '#9ca3af' }}>
              <span>Desconto especial</span>
              <span style={{ color: COR_OURO }}>{descontoPct}% = {fmt(valorDesconto)}</span>
            </div>
            <input
              type="range" min={5} max={40} step={5}
              value={descontoPct}
              onChange={e => setDescontoPct(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: COR_OURO }}
            />
            <div className="flex justify-between text-xs mt-0.5" style={{ color: '#4b5563' }}>
              <span>5%</span><span>40%</span>
            </div>
          </div>

          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2">
            {(['avista', 'parcelado'] as const).map(tipo => (
              <button
                key={tipo}
                onClick={() => setTipoAcordo(tipo)}
                className="py-2 rounded-lg text-sm font-medium border transition-colors"
                style={{
                  backgroundColor: tipoAcordo === tipo ? COR_OURO + '22' : 'transparent',
                  borderColor:     tipoAcordo === tipo ? COR_OURO : '#374151',
                  color:           tipoAcordo === tipo ? COR_OURO : '#6b7280',
                }}
              >
                {tipo === 'avista' ? 'À Vista' : 'Parcelado'}
              </button>
            ))}
          </div>

          {/* Parcelas */}
          {tipoAcordo === 'parcelado' && (
            <div>
              <label className="block text-xs mb-1.5" style={{ color: '#9ca3af' }}>
                Número de parcelas
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[2, 3, 6, 12].map(n => (
                  <button
                    key={n}
                    onClick={() => setNumParcelas(n)}
                    className="py-1.5 rounded-lg text-sm font-medium border transition-colors"
                    style={{
                      backgroundColor: numParcelas === n ? COR_OURO + '22' : 'transparent',
                      borderColor:     numParcelas === n ? COR_OURO : '#374151',
                      color:           numParcelas === n ? COR_OURO : '#6b7280',
                    }}
                  >
                    {n}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resumo */}
          <div
            className="rounded-lg p-4 space-y-2"
            style={{ backgroundColor: '#060e18', border: `1px solid ${COR_OURO}44` }}
          >
            <div className="flex justify-between text-xs" style={{ color: '#6b7280' }}>
              <span>Valor original</span>
              <span>{fmt(dados.valor_atualizado)}</span>
            </div>
            <div className="flex justify-between text-xs" style={{ color: '#22c55e' }}>
              <span>Desconto ({descontoPct}%)</span>
              <span>− {fmt(valorDesconto)}</span>
            </div>
            <div className="border-t border-gray-800 pt-2 flex justify-between font-bold text-sm" style={{ color: COR_OURO }}>
              <span>
                {tipoAcordo === 'avista'
                  ? 'Total à vista'
                  : `${numParcelas}x de`}
              </span>
              <span>{fmt(valorParcela)}</span>
            </div>
            <div className="text-xs text-center" style={{ color: '#4b5563' }}>
              Primeiro vencimento: {primeiroVenc}
            </div>
          </div>

          {/* Pix automático */}
          {tipoAcordo === 'parcelado' && (
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: '#9ca3af' }}>
              <input
                type="checkbox"
                checked={pixAuto}
                onChange={e => setPixAuto(e.target.checked)}
                className="rounded"
                style={{ accentColor: COR_OURO }}
              />
              Autorizar débito automático via Pix (parcelas mensais)
            </label>
          )}
        </div>

        {/* LGPD disclaimer */}
        <div
          className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
          style={{ backgroundColor: '#0a1520', border: '1px solid #1e3a5f', color: '#6b7280' }}
        >
          <Shield size={12} className="mt-0.5 shrink-0" />
          <span>
            Ao confirmar, você consente com o tratamento dos seus dados para fins de cobrança,
            nos termos do Art. 7º, V da <strong>LGPD (Lei 13.709/2018)</strong>.
            Seus dados são protegidos e utilizados exclusivamente por ANDRADE & CINTRA Advogados.
          </span>
        </div>

        {/* Botão confirmar */}
        {etapa === 'confirmando' ? (
          <div
            className="rounded-xl p-5 text-center"
            style={{ backgroundColor: '#0a1520', border: `1px solid ${COR_OURO}33` }}
          >
            <p className="text-sm mb-3" style={{ color: '#d1d5db' }}>
              Confirme seu acordo:
              <br />
              <strong style={{ color: COR_OURO }}>
                {tipoAcordo === 'avista'
                  ? `${fmt(valorAcordo)} à vista`
                  : `${numParcelas}x de ${fmt(valorParcela)}`}
              </strong>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setEtapa('exibindo')}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm border transition-colors"
                style={{ borderColor: '#374151', color: '#6b7280' }}
              >
                Voltar
              </button>
              <button
                onClick={confirmarAcordo}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors hover:opacity-80"
                style={{ backgroundColor: COR_VINHO, color: 'white' }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {loading ? 'Registrando…' : 'Confirmar Acordo'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEtapa('confirmando')}
            className="w-full py-3.5 rounded-xl text-base font-bold transition-colors hover:opacity-80"
            style={{ backgroundColor: COR_OURO, color: COR_NAVY }}
          >
            Aceitar Proposta
          </button>
        )}

        {/* Rodapé */}
        <p className="text-center text-xs pb-4" style={{ color: '#374151' }}>
          ANDRADE & CINTRA Advogados · VINDEX · jgac@cintraadvogados.com.br
        </p>
      </div>
    </div>
  )
}
