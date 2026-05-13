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
import VindexLogo from '@/components/brand/VindexLogo'
import VindexIcon from '@/components/brand/VindexIcon'

// ââ Tipos ââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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

// ââ Helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââ

const COR_NAVY   = '#0E1B2A'
const COR_NAVY_2 = '#0a1420'
const COR_NAVY_3 = '#06101a'
const COR_OURO   = '#B79A5A'
const COR_VINHO  = '#5A1220'

function fmt(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

function calcularDesconto(valor: number, pct: number): number {
  return Math.round(valor * pct) / 100
}

// ââ Tela: Carregando âââââââââââââââââââââââââââââââââââââââââââ

function TelaCarregando() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ backgroundColor: COR_NAVY_3 }}>
      <Loader2 size={40} className="animate-spin" style={{ color: COR_OURO }} />
      <p className="text-sm" style={{ color: '#9ca3af' }}>Verificando seu linkâ¦</p>
    </div>
  )
}

// ââ Tela: Erro/Expirado/Usado ââââââââââââââââââââââââââââââââââ

function TelaErro({ tipo, mensagem }: { tipo: 'erro' | 'expirado' | 'usado'; mensagem: string }) {
  const icone = tipo === 'usado'
    ? <CheckCircle2 size={48} style={{ color: COR_OURO }} />
    : tipo === 'expirado'
      ? <div style={{ opacity: 0.4 }}><VindexIcon size={48} variant="gold" /></div>
      : <AlertTriangle size={48} style={{ color: '#ef4444' }} />

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-5 p-6 text-center" style={{ backgroundColor: COR_NAVY }}>
      <VindexLogo variant="vertical" theme="dark" size="sm" />
      {icone}
      <div>
        <h2
          className="font-bold mb-2"
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: 20,
            color: tipo === 'usado' ? COR_OURO : tipo === 'expirado' ? '#666' : '#f87171',
          }}
        >
          {tipo === 'expirado' ? 'Link Expirado'
           : tipo === 'usado'  ? 'Acordo Já Registrado'
           : 'Link Inválido'}
        </h2>
        <p className="text-sm max-w-sm" style={{ color: '#9ca3af' }}>{mensagem}</p>
      </div>
      <div
        className="mt-4 px-4 py-3 rounded-lg text-xs text-center max-w-sm"
        style={{ backgroundColor: COR_NAVY_2, border: `1px solid ${COR_OURO}33`, color: '#9ca3af' }}
      >
        Em caso de dúvidas, entre em contato com o escritório:<br />
        <a href="mailto:jgac@cintraadvogados.com.br" style={{ color: COR_OURO }}>
          jgac@cintraadvogados.com.br
        </a>
      </div>
      <a
        href="https://wa.me/5511999999999"
        target="_blank"
        rel="noopener noreferrer"
        className="px-5 py-3 text-sm"
        style={{
          backgroundColor: '#25d366',
          color: '#fff',
          borderRadius: 8,
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 700,
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        Falar pelo WhatsApp
      </a>
    </div>
  )
}

// ââ Tela: Concluído ââââââââââââââââââââââââââââââââââââââââââââ

function TelaConcluido({ dados, acordoId, pdf }: { dados: DadosCaso; acordoId: string; pdf: ArrayBuffer | null }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-6 text-center" style={{ backgroundColor: COR_NAVY_3 }}>
      <div style={{ margin: '0 auto' }}>
        <VindexIcon size={60} variant="gold" />
      </div>

      <div
        className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `${COR_OURO}1A`, border: `2px solid ${COR_OURO}` }}
      >
        <CheckCircle2 size={32} style={{ color: COR_OURO }} />
      </div>

      <div>
        <h2
          className="font-bold mb-2"
          style={{ fontFamily: 'Cinzel, serif', fontSize: 22, color: COR_OURO }}
        >
          Acordo Registrado
        </h2>
        <p className="text-sm" style={{ fontFamily: 'Lato, sans-serif', fontSize: 14, color: '#C7CBD1' }}>
          Sua confissão de dívida foi gerada.
        </p>
        <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
          Protocolo: {acordoId.slice(0, 8).toUpperCase()}
        </p>
      </div>

      <div
        className="w-full max-w-sm rounded-xl p-4 text-left text-sm"
        style={{ backgroundColor: COR_NAVY_2, border: `1px solid ${COR_OURO}33` }}
      >
        <p className="text-xs font-medium mb-2" style={{ color: COR_OURO }}>Próximos Passos</p>
        <ul className="space-y-1.5 text-xs" style={{ color: '#9ca3af' }}>
          <li>â¢ Em até 24h você receberá os boletos/link Pix por e-mail</li>
          <li>â¢ Guarde o PDF da confissão de dívida como comprovante</li>
          <li>â¢ Em caso de dúvidas: {dados.advogado_email}</li>
        </ul>
      </div>

      {pdf && (
        <button
          onClick={() => downloadConfissao(pdf, dados.devedor_nome)}
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
          style={{
            backgroundColor: COR_OURO,
            color: COR_NAVY,
            fontFamily: 'Cinzel, serif',
            fontWeight: 700,
            fontSize: 13,
            padding: '14px 24px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Download size={15} />
          Baixar Confissão de Dívida (PDF)
        </button>
      )}

      <div style={{ marginTop: 40, opacity: 0.6 }}>
        <VindexLogo variant="vertical" theme="dark" size="sm" />
      </div>
    </div>
  )
}

// ââ Componente principal âââââââââââââââââââââââââââââââââââââââ

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

  // ââ Carregar dados do token ââââââââââââââââââââââââââââââââââ

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

  // ââ Confirmar acordo âââââââââââââââââââââââââââââââââââââââââ

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

  // ââ Renders condicionais âââââââââââââââââââââââââââââââââââââ

  if (etapa === 'carregando') return <TelaCarregando />
  if (etapa === 'erro')      return <TelaErro tipo="erro"     mensagem={errMsg} />
  if (etapa === 'expirado')  return <TelaErro tipo="expirado" mensagem={errMsg} />
  if (etapa === 'usado')     return <TelaErro tipo="usado"    mensagem={errMsg} />
  if (etapa === 'concluido' && dados) return <TelaConcluido dados={dados} acordoId={acordoId} pdf={pdf} />
  if (!dados) return <TelaCarregando />

  // ââ Cálculos ââââââââââââââââââââââââââââââââââââââââââââââââââ

  const valorDesconto = calcularDesconto(dados.valor_atualizado, descontoPct)
  const valorAcordo   = dados.valor_atualizado - valorDesconto
  const valorParcela  = tipoAcordo === 'parcelado' ? valorAcordo / numParcelas : valorAcordo
  const primeiroVenc  = format(addDays(new Date(), 3), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  const dataAtualizada = format(new Date(), "dd/MM/yyyy", { locale: ptBR })

  // ââ Render principal ââââââââââââââââââââââââââââââââââââââââââ

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: COR_NAVY_3 }}>

      {/* Top section — full width, COR_NAVY background */}
      <div style={{ backgroundColor: COR_NAVY, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <VindexLogo variant="vertical" theme="dark" size="lg" />
        </div>
        <p style={{
          fontFamily: 'Cinzel, serif',
          fontSize: 9,
          letterSpacing: 3,
          color: COR_OURO,
          opacity: 0.6,
          marginTop: 12,
          textTransform: 'uppercase',
        }}>
          DIREITO QUE RECUPERA. ESTRATÉGIA QUE PROTEGE.
        </p>
      </div>

      {/* Main card */}
      <div style={{
        maxWidth: 520,
        margin: '32px auto 0',
        padding: '0 16px',
      }}>
        <div style={{
          backgroundColor: COR_NAVY_2,
          border: `1px solid rgba(183,154,90,0.25)`,
          borderTop: `3px solid ${COR_OURO}`,
          borderRadius: 12,
          padding: 36,
        }}>

          {/* Title + devedor */}
          <h1 style={{
            fontFamily: 'Cinzel, serif',
            fontSize: 20,
            color: '#F6F2EC',
            margin: 0,
          }}>
            Proposta de Regularização
          </h1>
          <p style={{
            fontFamily: 'Montserrat, sans-serif',
            fontSize: 14,
            color: COR_OURO,
            marginTop: 6,
            marginBottom: 0,
          }}>
            {dados.devedor_nome}
          </p>

          {/* Separator */}
          <div style={{
            height: 1,
            backgroundColor: 'rgba(183,154,90,0.2)',
            margin: '20px 0',
          }} />

          {/* Valor em aberto */}
          <div>
            <p style={{
              fontFamily: 'Montserrat, sans-serif',
              fontSize: 10,
              color: '#666',
              textTransform: 'uppercase',
              letterSpacing: 1,
              margin: 0,
            }}>
              VALOR EM ABERTO
            </p>
            <p style={{
              fontFamily: 'Cinzel, serif',
              fontWeight: 700,
              fontSize: 28,
              color: '#F6F2EC',
              margin: '4px 0 2px',
            }}>
              {fmt(dados.valor_atualizado)}
            </p>
            <p style={{
              fontFamily: 'Lato, sans-serif',
              fontSize: 11,
              color: '#555',
              margin: 0,
            }}>
              atualizado em {dataAtualizada}
            </p>
          </div>

          {/* Separator */}
          <div style={{
            height: 1,
            backgroundColor: 'rgba(183,154,90,0.2)',
            margin: '20px 0',
          }} />

          {/* Resumo do débito detalhado */}
          <div style={{
            backgroundColor: COR_NAVY_3,
            border: `1px solid rgba(183,154,90,0.15)`,
            borderRadius: 8,
            overflow: 'hidden',
            marginBottom: 20,
          }}>
            {[
              ['Credor',           dados.credor_nome],
              ['Valor original',   fmt(dados.valor_original)],
              ['Vencimento',       format(new Date(dados.data_vencimento + 'T12:00:00'), 'dd/MM/yyyy')],
              ['Valor atualizado', fmt(dados.valor_atualizado)],
            ].map(([k, v], idx) => (
              <div key={k} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 16px',
                borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
              }}>
                <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#666' }}>{k}</span>
                <span style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: '#d1d5db' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Monte sua proposta */}
          <p style={{
            fontFamily: 'Montserrat, sans-serif',
            fontSize: 11,
            color: COR_OURO,
            textTransform: 'uppercase',
            letterSpacing: 1,
            margin: '0 0 16px',
          }}>
            Monte sua Proposta
          </p>

          {/* Desconto slider */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: '#9ca3af' }}>Desconto especial</span>
              <span style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: COR_OURO }}>
                {descontoPct}% = {fmt(valorDesconto)}
              </span>
            </div>
            <input
              type="range" min={5} max={40} step={5}
              value={descontoPct}
              onChange={e => setDescontoPct(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: COR_OURO }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ fontFamily: 'Lato, sans-serif', fontSize: 11, color: '#4b5563' }}>5%</span>
              <span style={{ fontFamily: 'Lato, sans-serif', fontSize: 11, color: '#4b5563' }}>40%</span>
            </div>
          </div>

          {/* Tipo Ã vista / Parcelado */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {(['avista', 'parcelado'] as const).map(tipo => (
              <button
                key={tipo}
                onClick={() => setTipoAcordo(tipo)}
                style={{
                  padding: '10px 0',
                  borderRadius: 6,
                  border: `1px solid ${tipoAcordo === tipo ? COR_OURO : '#374151'}`,
                  backgroundColor: tipoAcordo === tipo ? `${COR_OURO}22` : 'transparent',
                  color: tipoAcordo === tipo ? COR_OURO : '#6b7280',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {tipo === 'avista' ? 'Ã Vista' : 'Parcelado'}
              </button>
            ))}
          </div>

          {/* Parcelas */}
          {tipoAcordo === 'parcelado' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block',
                fontFamily: 'Montserrat, sans-serif',
                fontSize: 11,
                color: '#9ca3af',
                marginBottom: 8,
              }}>
                Número de parcelas
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {[2, 3, 6, 12].map(n => (
                  <button
                    key={n}
                    onClick={() => setNumParcelas(n)}
                    style={{
                      padding: '8px 0',
                      borderRadius: 6,
                      border: `1px solid ${numParcelas === n ? COR_OURO : '#374151'}`,
                      backgroundColor: numParcelas === n ? `${COR_OURO}22` : 'transparent',
                      color: numParcelas === n ? COR_OURO : '#6b7280',
                      fontFamily: 'Montserrat, sans-serif',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {n}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resumo de valores */}
          <div style={{
            backgroundColor: COR_NAVY_3,
            border: `1px solid rgba(183,154,90,0.27)`,
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: '#6b7280' }}>Valor original</span>
              <span style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: '#6b7280' }}>{fmt(dados.valor_atualizado)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: '#22c55e' }}>Desconto ({descontoPct}%)</span>
              <span style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: '#22c55e' }}>â {fmt(valorDesconto)}</span>
            </div>
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: 10,
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: 13, color: COR_OURO }}>
                {tipoAcordo === 'avista' ? 'Total Ã  vista' : `${numParcelas}x de`}
              </span>
              <span style={{ fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: 13, color: COR_OURO }}>
                {fmt(valorParcela)}
              </span>
            </div>
            <div style={{
              fontFamily: 'Lato, sans-serif',
              fontSize: 11,
              color: '#4b5563',
              textAlign: 'center',
              marginTop: 8,
            }}>
              Primeiro vencimento: {primeiroVenc}
            </div>
          </div>

          {/* Pix automático */}
          {tipoAcordo === 'parcelado' && (
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'Lato, sans-serif',
              fontSize: 12,
              color: '#9ca3af',
              cursor: 'pointer',
              userSelect: 'none',
              marginBottom: 16,
            }}>
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

          {/* LGPD disclaimer */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 6,
            backgroundColor: COR_NAVY_3,
            border: '1px solid #1e3a5f',
            color: '#6b7280',
            fontFamily: 'Lato, sans-serif',
            fontSize: 11,
            marginBottom: 20,
          }}>
            <Shield size={12} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>
              Ao confirmar, você consente com o tratamento dos seus dados para fins de cobrança,
              nos termos do Art. 7Âº, V da <strong>LGPD (Lei 13.709/2018)</strong>.
              Seus dados são protegidos e utilizados exclusivamente por ANDRADE & CINTRA Advogados.
            </span>
          </div>

          {/* Botões de ação */}
          {etapa === 'confirmando' ? (
            <div style={{
              backgroundColor: COR_NAVY_3,
              border: `1px solid rgba(183,154,90,0.25)`,
              borderRadius: 8,
              padding: 20,
              textAlign: 'center',
            }}>
              <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 13, color: '#d1d5db', marginBottom: 16 }}>
                Confirme seu acordo:<br />
                <strong style={{ color: COR_OURO }}>
                  {tipoAcordo === 'avista'
                    ? `${fmt(valorAcordo)} Ã  vista`
                    : `${numParcelas}x de ${fmt(valorParcela)}`}
                </strong>
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setEtapa('exibindo')}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 6,
                    border: '1px solid #374151',
                    backgroundColor: 'transparent',
                    color: '#6b7280',
                    fontFamily: 'Montserrat, sans-serif',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Voltar
                </button>
                <button
                  onClick={confirmarAcordo}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: COR_VINHO,
                    color: 'white',
                    fontFamily: 'Cinzel, serif',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  {loading ? 'Registrandoâ¦' : 'Confirmar Acordo'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Botão 1 — Pagar Ã  vista */}
              <button
                onClick={() => { setTipoAcordo('avista'); setEtapa('confirmando') }}
                style={{
                  width: '100%',
                  padding: 16,
                  borderRadius: 6,
                  border: 'none',
                  backgroundColor: COR_OURO,
                  color: COR_NAVY,
                  fontFamily: 'Cinzel, serif',
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: 2,
                  cursor: 'pointer',
                  marginTop: 20,
                  textTransform: 'uppercase',
                }}
              >
                PAGAR Ã VISTA COM PIX
                {descontoPct > 0 && (
                  <div style={{
                    fontFamily: 'Lato, sans-serif',
                    fontSize: 11,
                    color: COR_NAVY,
                    opacity: 0.8,
                    marginTop: 4,
                    fontWeight: 400,
                    letterSpacing: 0,
                    textTransform: 'none',
                  }}>
                    Desconto de {descontoPct}% — Economia de {fmt(valorDesconto)}
                  </div>
                )}
              </button>

              {/* Botão 2 — Parcelar */}
              <button
                onClick={() => { setTipoAcordo('parcelado'); setEtapa('confirmando') }}
                style={{
                  width: '100%',
                  padding: 14,
                  borderRadius: 6,
                  border: `1px solid ${COR_VINHO}`,
                  backgroundColor: 'transparent',
                  color: '#F6F2EC',
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: 13,
                  cursor: 'pointer',
                  marginTop: 12,
                }}
              >
                Parcelar em até {numParcelas}x
              </button>

              {/* Botão 3 — WhatsApp */}
              <a
                href="https://wa.me/5511999999999"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: 12,
                  borderRadius: 6,
                  border: `1px solid rgba(183,154,90,0.2)`,
                  backgroundColor: 'transparent',
                  color: '#666',
                  fontFamily: 'Lato, sans-serif',
                  fontSize: 12,
                  cursor: 'pointer',
                  marginTop: 8,
                  textAlign: 'center',
                  textDecoration: 'none',
                  boxSizing: 'border-box',
                }}
              >
                Falar com o escritório pelo WhatsApp
              </a>
            </>
          )}
        </div>

        {/* Rodapé */}
        <p className="text-center text-xs pb-4 mt-6" style={{
          fontFamily: 'Lato, sans-serif',
          color: '#374151',
        }}>
          ANDRADE & CINTRA Advogados Â· VINDEX Â· jgac@cintraadvogados.com.br
        </p>
      </div>
    </div>
  )
}
