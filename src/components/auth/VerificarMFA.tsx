/**
 * VerificarMFA.tsx
 * Tela de verificação de MFA exibida APÓS login com senha bem-sucedido.
 * Suporta código TOTP (6 dígitos) e código de backup (8 caracteres).
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { ShieldCheck, Lock, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react'
import { verificarMFA } from '@/lib/seguranca/mfa'

// ─── Paleta VINDEX ────────────────────────────────────────────
const COR_NAVY = '#0E1B2A'
const COR_OURO = '#B79A5A'
const COR_VINHO = '#5A1220'

// ─── Props ────────────────────────────────────────────────────
interface Props {
  usuario_id: string
  onVerificado: () => void
  onCancelar: () => void
}

// ─── Countdown: mostra tempo restante até desbloqueio ────────
function CountdownBloqueio({ liberadoEm }: { liberadoEm: Date }) {
  const [segundosRestantes, setSegundosRestantes] = useState<number>(() => {
    const diff = Math.max(0, Math.floor((liberadoEm.getTime() - Date.now()) / 1000))
    return diff
  })

  useEffect(() => {
    if (segundosRestantes <= 0) return
    const id = setInterval(() => {
      setSegundosRestantes(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [segundosRestantes])

  const min = Math.floor(segundosRestantes / 60)
  const sec = segundosRestantes % 60
  const formatted = min > 0
    ? `${min}m ${sec.toString().padStart(2, '0')}s`
    : `${sec}s`

  return (
    <span className="font-mono font-bold" style={{ color: '#F87171' }}>
      {formatted}
    </span>
  )
}

// ─── Componente principal ─────────────────────────────────────
export default function VerificarMFA({ usuario_id, onVerificado, onCancelar }: Props) {
  const [codigo, setCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [tentativas, setTentativas] = useState(5)
  const [usandoBackup, setUsandoBackup] = useState(false)
  const [bloqueado, setBloqueado] = useState(false)
  const [liberadoEm, setLiberadoEm] = useState<Date | null>(null)
  const [verificado, setVerificado] = useState(false)
  const [shake, setShake] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // Autofocus no mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Refocus ao trocar modo backup
  useEffect(() => {
    inputRef.current?.focus()
  }, [usandoBackup])

  const triggerShake = useCallback(() => {
    setShake(true)
    setTimeout(() => setShake(false), 600)
  }, [])

  const handleVerificar = useCallback(async (codigoParaVerificar: string) => {
    if (!codigoParaVerificar || loading || bloqueado) return

    setLoading(true)
    setErro('')
    try {
      const resultado = await verificarMFA(usuario_id, codigoParaVerificar)

      if (resultado.sucesso) {
        setVerificado(true)
        setTimeout(() => onVerificado(), 800)
      } else {
        triggerShake()
        setCodigo('')

        if (resultado.bloqueado) {
          setBloqueado(true)
          if (resultado.bloqueado_ate) {
            setLiberadoEm(new Date(resultado.bloqueado_ate))
          }
          setErro('Conta temporariamente bloqueada por excesso de tentativas.')
        } else {
          const tentRest = resultado.tentativas_restantes ?? (tentativas - 1)
          setTentativas(tentRest)
          setErro(resultado.erro ?? 'Código inválido. Tente novamente.')
        }
      }
    } catch (e) {
      triggerShake()
      setCodigo('')
      setErro(e instanceof Error ? e.message : 'Erro ao verificar. Tente novamente.')
    } finally {
      setLoading(false)
      // Refocus após erro
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [loading, bloqueado, usuario_id, tentativas, triggerShake, onVerificado])

  // Auto-submit ao digitar 6 dígitos (modo TOTP)
  useEffect(() => {
    if (!usandoBackup && codigo.length === 6) {
      handleVerificar(codigo)
    }
  }, [codigo, usandoBackup, handleVerificar])

  const handleChangeCodigo = (val: string) => {
    if (usandoBackup) {
      // Backup: alfanumérico, max 8
      setCodigo(val.toUpperCase().slice(0, 9)) // inclui hífen: XXXX-XXXX
    } else {
      // TOTP: somente dígitos, max 6
      setCodigo(val.replace(/\D/g, '').slice(0, 6))
    }
  }

  const tentativasColor = tentativas <= 2 ? '#F97316' : 'rgba(255,255,255,0.5)'

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#060e18' }}
    >
      <div
        className="w-full max-w-sm rounded-xl overflow-hidden"
        style={{
          backgroundColor: '#0F1E2E',
          border: `1px solid rgba(183,154,90,0.25)`,
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header VINDEX */}
        <div
          className="px-8 py-5 flex items-center justify-center gap-3"
          style={{ backgroundColor: COR_NAVY, borderBottom: `2px solid ${COR_OURO}` }}
        >
          <ShieldCheck size={22} style={{ color: COR_OURO }} />
          <span
            className="font-cinzel text-xl font-bold tracking-widest"
            style={{ color: COR_OURO }}
          >
            VINDEX
          </span>
        </div>

        <div className="px-8 py-8 space-y-6">
          {/* Estado: verificado */}
          {verificado ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(74,222,128,0.12)', border: '2px solid #4ADE80' }}
              >
                <CheckCircle2 size={40} style={{ color: '#4ADE80' }} />
              </div>
              <p className="font-cinzel text-lg font-bold" style={{ color: '#4ADE80' }}>
                Verificado!
              </p>
            </div>
          ) : (
            <>
              {/* Título */}
              <div className="text-center space-y-2">
                <h1 className="font-cinzel text-lg font-bold text-white">
                  Verificação em Dois Fatores
                </h1>
                <p className="text-sm font-lato" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {usandoBackup
                    ? 'Digite um dos seus códigos de backup (XXXX-XXXX)'
                    : 'Digite o código de 6 dígitos do seu aplicativo autenticador'}
                </p>
              </div>

              {/* Bloqueio */}
              {bloqueado ? (
                <div
                  className="rounded-xl p-5 flex flex-col items-center gap-3 text-center"
                  style={{
                    backgroundColor: 'rgba(90,18,32,0.35)',
                    border: '1px solid rgba(239,68,68,0.5)',
                  }}
                >
                  <Lock size={36} style={{ color: '#F87171' }} />
                  <p className="font-montserrat font-semibold text-sm" style={{ color: '#FCA5A5' }}>
                    Conta bloqueada
                  </p>
                  {liberadoEm ? (
                    <p className="text-xs font-lato" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Disponível em <CountdownBloqueio liberadoEm={liberadoEm} />
                    </p>
                  ) : (
                    <p className="text-xs font-lato" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Entre em contato com o administrador.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {/* Input */}
                  <div
                    className="transition-all"
                    style={{
                      animation: shake ? 'shake 0.5s ease-in-out' : undefined,
                    }}
                  >
                    <style>{`
                      @keyframes shake {
                        0%, 100% { transform: translateX(0); }
                        15% { transform: translateX(-8px); }
                        30% { transform: translateX(8px); }
                        45% { transform: translateX(-6px); }
                        60% { transform: translateX(6px); }
                        75% { transform: translateX(-3px); }
                        90% { transform: translateX(3px); }
                      }
                    `}</style>
                    <input
                      ref={inputRef}
                      type="text"
                      inputMode={usandoBackup ? 'text' : 'numeric'}
                      pattern={usandoBackup ? undefined : '[0-9]*'}
                      maxLength={usandoBackup ? 9 : 6}
                      value={codigo}
                      onChange={e => handleChangeCodigo(e.target.value)}
                      placeholder={usandoBackup ? 'XXXX-XXXX' : '000000'}
                      autoFocus
                      disabled={loading}
                      className="w-full text-center py-4 rounded-xl outline-none transition-all font-mono
                                 disabled:opacity-60"
                      style={{
                        fontSize: usandoBackup ? '1.5rem' : '2rem',
                        letterSpacing: usandoBackup ? '0.15em' : '0.5em',
                        backgroundColor: 'rgba(14,27,42,0.85)',
                        border: `2px solid ${erro ? '#EF4444' : 'rgba(183,154,90,0.4)'}`,
                        color: '#E2E8F0',
                        caretColor: COR_OURO,
                      }}
                      onFocus={e => {
                        e.currentTarget.style.borderColor = erro ? '#EF4444' : COR_OURO
                      }}
                      onBlur={e => {
                        e.currentTarget.style.borderColor = erro ? '#EF4444' : 'rgba(183,154,90,0.4)'
                      }}
                    />
                  </div>

                  {/* Tentativas restantes */}
                  {!erro && (
                    <p className="text-xs text-center font-montserrat" style={{ color: tentativasColor }}>
                      {tentativas} tentativa{tentativas !== 1 ? 's' : ''} restante{tentativas !== 1 ? 's' : ''}
                    </p>
                  )}

                  {/* Erro */}
                  {erro && (
                    <div
                      className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm font-lato"
                      style={{
                        backgroundColor: 'rgba(90,18,32,0.4)',
                        border: '1px solid rgba(239,68,68,0.4)',
                        color: '#FCA5A5',
                      }}
                    >
                      <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                      <div>
                        <p>{erro}</p>
                        <p
                          className="mt-1 text-xs font-semibold"
                          style={{ color: tentativas <= 2 ? '#F87171' : '#FCA5A5' }}
                        >
                          {tentativas} tentativa{tentativas !== 1 ? 's' : ''} restante{tentativas !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Botão Verificar (somente no modo backup) */}
                  {usandoBackup && (
                    <button
                      onClick={() => handleVerificar(codigo)}
                      disabled={loading || codigo.length < 8}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg
                                 font-montserrat font-semibold text-sm text-white transition-all
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: COR_VINHO }}
                      onMouseEnter={e => {
                        if (!loading && codigo.length >= 8)
                          (e.currentTarget as HTMLButtonElement).style.backgroundColor = COR_OURO
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = COR_VINHO
                      }}
                    >
                      {loading ? (
                        <><Loader2 size={16} className="animate-spin" /> Verificando...</>
                      ) : (
                        <><ShieldCheck size={16} /> Verificar</>
                      )}
                    </button>
                  )}

                  {/* Loading feedback para TOTP */}
                  {!usandoBackup && loading && (
                    <div className="flex items-center justify-center gap-2 text-sm font-lato"
                      style={{ color: 'rgba(255,255,255,0.5)' }}>
                      <Loader2 size={14} className="animate-spin" />
                      Verificando...
                    </div>
                  )}

                  {/* Link modo backup */}
                  <button
                    onClick={() => {
                      setUsandoBackup(v => !v)
                      setCodigo('')
                      setErro('')
                    }}
                    className="w-full text-center text-xs font-montserrat transition-opacity hover:opacity-80"
                    style={{ color: COR_OURO }}
                  >
                    {usandoBackup
                      ? '← Usar código do autenticador'
                      : 'Usar código de backup'}
                  </button>
                </>
              )}

              {/* Cancelar */}
              <button
                onClick={onCancelar}
                className="w-full py-2.5 text-sm font-montserrat font-medium rounded-lg transition-all
                           hover:opacity-80"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.5)',
                }}
              >
                Cancelar e sair
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
