/**
 * ConfigurarMFA.tsx
 * Tela de configuração de MFA (TOTP) — chamada após primeiro login para roles ADVOGADO/ADMIN.
 *
 * Etapas:
 *   1 — Apresentação
 *   2 — QR Code + códigos de backup
 *   3 — Verificação do código
 */

import { useState, useCallback } from 'react'
import {
  ShieldCheck,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react'
import { configurarMFA, verificarMFA } from '@/lib/seguranca/mfa'
import type { MFASetup } from '@/lib/seguranca/mfa'

// âââ Paleta VINDEX ââââââââââââââââââââââââââââââââââââââââââââ
const COR_NAVY = '#0E1B2A'
const COR_OURO = '#B79A5A'
const COR_VINHO = '#5A1220'

// âââ Props ââââââââââââââââââââââââââââââââââââââââââââââââââââ
interface Props {
  usuario_id: string
  onConcluido: () => void
}

// âââ Barra de progresso das etapas âââââââââââââââââââââââââââ
function BarraEtapas({ etapa }: { etapa: 1 | 2 | 3 }) {
  const etapas = ['Início', 'QR Code', 'Verificar'] as const
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {etapas.map((label, idx) => {
        const num = (idx + 1) as 1 | 2 | 3
        const ativa = etapa === num
        const concluida = etapa > num
        return (
          <div key={num} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-montserrat transition-all"
                style={{
                  backgroundColor: concluida ? COR_OURO : ativa ? COR_VINHO : 'rgba(255,255,255,0.1)',
                  color: concluida || ativa ? '#fff' : 'rgba(255,255,255,0.4)',
                  border: `2px solid ${ativa ? COR_OURO : concluida ? COR_OURO : 'rgba(255,255,255,0.15)'}`,
                }}
              >
                {concluida ? <CheckCircle2 size={14} /> : num}
              </div>
              <span
                className="mt-1 text-[10px] font-montserrat font-semibold uppercase tracking-wide"
                style={{ color: ativa ? COR_OURO : concluida ? '#9CA3AF' : 'rgba(255,255,255,0.3)' }}
              >
                {label}
              </span>
            </div>
            {idx < etapas.length - 1 && (
              <div
                className="w-16 h-px mx-1 mb-5"
                style={{ backgroundColor: etapa > num ? COR_OURO : 'rgba(255,255,255,0.15)' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// âââ Componente principal âââââââââââââââââââââââââââââââââââââ
export default function ConfigurarMFA({ usuario_id, onConcluido }: Props) {
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1)
  const [mfaSetup, setMfaSetup] = useState<MFASetup | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [codigo, setCodigo] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [copiadoCodigos, setCopiadoCodigos] = useState(false)
  const [secretVisivel, setSecretVisivel] = useState(false)
  const [verificacaoOk, setVerificacaoOk] = useState(false)
  const [tentativasRestantes, setTentativasRestantes] = useState<number | null>(null)

  // ââ Etapa 1: iniciar configuração ââââââââââââââââââââââââ
  const handleIniciar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const setup = await configurarMFA(usuario_id)
      setMfaSetup(setup)
      setEtapa(2)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao iniciar configuração de MFA.')
    } finally {
      setLoading(false)
    }
  }, [usuario_id])

  // ââ Copiar segredo âââââââââââââââââââââââââââââââââââââââ
  const handleCopiarSecret = useCallback(async () => {
    if (!mfaSetup?.secret) return
    try {
      await navigator.clipboard.writeText(mfaSetup.secret)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // fallback silencioso
    }
  }, [mfaSetup])

  // ââ Copiar todos os códigos de backup ââââââââââââââââââââ
  const handleCopiarCodigos = useCallback(async () => {
    if (!mfaSetup?.backup_codes) return
    try {
      await navigator.clipboard.writeText(mfaSetup.backup_codes.join('\n'))
      setCopiadoCodigos(true)
      setTimeout(() => setCopiadoCodigos(false), 2500)
    } catch {
      // fallback silencioso
    }
  }, [mfaSetup])

  // ââ Etapa 3: verificar código ââââââââââââââââââââââââââââ
  const handleVerificar = useCallback(async () => {
    if (codigo.length !== 6) return
    setLoading(true)
    setErro('')
    try {
      const resultado = await verificarMFA(usuario_id, codigo)
      if (resultado.sucesso) {
        setVerificacaoOk(true)
        setTimeout(() => onConcluido(), 2000)
      } else {
        setErro(resultado.erro ?? 'Código inválido. Verifique o aplicativo autenticador.')
        if (resultado.tentativas_restantes !== undefined) {
          setTentativasRestantes(resultado.tentativas_restantes)
        }
        setCodigo('')
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao verificar código.')
      setCodigo('')
    } finally {
      setLoading(false)
    }
  }, [codigo, usuario_id, onConcluido])

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ backgroundColor: '#060e18' }}
    >
      {/* Cabeçalho VINDEX */}
      <div
        className="w-full max-w-lg rounded-t-xl px-8 py-5 flex items-center gap-3"
        style={{ backgroundColor: COR_NAVY, borderBottom: `2px solid ${COR_OURO}` }}
      >
        <ShieldCheck size={28} style={{ color: COR_OURO }} />
        <div>
          <p className="font-cinzel text-lg font-bold tracking-wide" style={{ color: COR_OURO }}>
            VINDEX
          </p>
          <p className="text-xs font-montserrat" style={{ color: 'rgba(255,255,255,0.5)' }}>
            VINDEX — Segurança
          </p>
        </div>
      </div>

      {/* Card principal */}
      <div
        className="w-full max-w-lg rounded-b-xl px-8 pt-8 pb-10"
        style={{ backgroundColor: '#0F1E2E', border: `1px solid rgba(183,154,90,0.2)`, borderTop: 'none' }}
      >
        <BarraEtapas etapa={etapa} />

        {/* ââ ETAPA 1: Apresentação ââ */}
        {etapa === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4"
                style={{ backgroundColor: 'rgba(183,154,90,0.12)', border: `1px solid ${COR_OURO}` }}
              >
                <ShieldCheck size={32} style={{ color: COR_OURO }} />
              </div>
              <h1 className="font-cinzel text-xl font-bold text-white leading-snug">
                Configuração de Autenticação<br />em Dois Fatores
              </h1>
            </div>

            <div
              className="rounded-lg px-5 py-4 text-sm font-lato leading-relaxed"
              style={{
                backgroundColor: 'rgba(14,27,42,0.8)',
                border: '1px solid rgba(183,154,90,0.2)',
                color: 'rgba(255,255,255,0.75)',
              }}
            >
              Para proteger sua conta e os dados dos clientes, você deve configurar o MFA.
              Use <span className="font-semibold text-white">Google Authenticator</span>,{' '}
              <span className="font-semibold text-white">Authy</span> ou outro app compatível
              com <span className="font-semibold text-white">TOTP</span>.
            </div>

            {erro && (
              <div
                className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm font-lato"
                style={{ backgroundColor: 'rgba(90,18,32,0.4)', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }}
              >
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                {erro}
              </div>
            )}

            <button
              onClick={handleIniciar}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-montserrat
                         font-semibold text-sm transition-all disabled:opacity-60"
              style={{ backgroundColor: COR_VINHO, color: '#fff' }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = COR_OURO }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = COR_VINHO }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Configurando...
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  Iniciar Configuração
                </>
              )}
            </button>
          </div>
        )}

        {/* ââ ETAPA 2: QR Code + Backup Codes ââ */}
        {etapa === 2 && mfaSetup && (
          <div className="space-y-6">
            <h2 className="font-cinzel text-lg font-bold text-center text-white">
              Escaneie o QR Code
            </h2>

            {/* QR Code */}
            <div
              className="rounded-xl p-5 flex flex-col items-center gap-3"
              style={{ backgroundColor: '#fff', border: `2px solid ${COR_OURO}` }}
            >
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mfaSetup.qr_uri)}`}
                alt="QR Code MFA"
                className="mx-auto rounded-lg"
                width={200}
                height={200}
              />
              <p className="text-xs font-montserrat text-center" style={{ color: '#6B7280' }}>
                Abra o app autenticador e escaneie o código acima
              </p>
            </div>

            {/* Segredo manual */}
            <div className="space-y-2">
              <p className="text-xs font-montserrat font-semibold uppercase tracking-wide"
                style={{ color: 'rgba(255,255,255,0.5)' }}>
                Inserção manual (se não conseguir escanear)
              </p>
              <div
                className="flex items-center gap-2 rounded-lg px-4 py-3"
                style={{ backgroundColor: 'rgba(14,27,42,0.8)', border: '1px solid rgba(183,154,90,0.2)' }}
              >
                <KeyRound size={14} style={{ color: COR_OURO, flexShrink: 0 }} />
                <code
                  className="flex-1 text-sm font-mono tracking-widest truncate select-all"
                  style={{ color: secretVisivel ? '#E2E8F0' : 'transparent', textShadow: secretVisivel ? 'none' : '0 0 8px rgba(255,255,255,0.5)' }}
                >
                  {mfaSetup.secret}
                </code>
                <button
                  onClick={() => setSecretVisivel(v => !v)}
                  title={secretVisivel ? 'Ocultar' : 'Mostrar'}
                  className="p-1 rounded transition-opacity hover:opacity-70"
                >
                  {secretVisivel
                    ? <EyeOff size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                    : <Eye size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                  }
                </button>
                <button
                  onClick={handleCopiarSecret}
                  title="Copiar segredo"
                  className="p-1 rounded transition-opacity hover:opacity-70"
                >
                  {copiado
                    ? <CheckCircle2 size={14} style={{ color: '#4ADE80' }} />
                    : <Copy size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                  }
                </button>
              </div>
            </div>

            {/* Códigos de backup */}
            <div className="space-y-3">
              <div
                className="flex items-start gap-2 rounded-lg px-4 py-3"
                style={{ backgroundColor: 'rgba(90,18,32,0.35)', border: '1px solid rgba(239,68,68,0.4)' }}
              >
                <AlertTriangle size={15} style={{ color: '#F87171', flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs font-lato leading-relaxed" style={{ color: '#FCA5A5' }}>
                  <strong>Salve estes códigos agora — eles não serão exibidos novamente.</strong>{' '}
                  Guarde em local seguro, fora do computador.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {mfaSetup.backup_codes.map((code, i) => (
                  <div
                    key={i}
                    className="rounded px-3 py-2 text-center font-mono text-sm font-semibold tracking-widest"
                    style={{
                      backgroundColor: 'rgba(14,27,42,0.9)',
                      border: '1px solid rgba(183,154,90,0.25)',
                      color: '#E2E8F0',
                    }}
                  >
                    {code}
                  </div>
                ))}
              </div>

              <button
                onClick={handleCopiarCodigos}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg
                           font-montserrat font-semibold text-sm transition-all"
                style={{
                  backgroundColor: copiadoCodigos ? 'rgba(74,222,128,0.15)' : 'rgba(183,154,90,0.12)',
                  border: `1px solid ${copiadoCodigos ? '#4ADE80' : COR_OURO}`,
                  color: copiadoCodigos ? '#4ADE80' : COR_OURO,
                }}
              >
                {copiadoCodigos ? (
                  <><CheckCircle2 size={14} /> Copiado!</>
                ) : (
                  <><Copy size={14} /> Copiar todos os códigos</>
                )}
              </button>
            </div>

            <button
              onClick={() => setEtapa(3)}
              className="w-full py-3 rounded-lg font-montserrat font-semibold text-sm text-white transition-all"
              style={{ backgroundColor: COR_VINHO }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = COR_OURO }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = COR_VINHO }}
            >
              Já salvei os códigos â
            </button>
          </div>
        )}

        {/* ââ ETAPA 3: Verificar código ââ */}
        {etapa === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              {verificacaoOk ? (
                <>
                  <div
                    className="w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-4 animate-pulse"
                    style={{ backgroundColor: 'rgba(74,222,128,0.15)', border: '2px solid #4ADE80' }}
                  >
                    <CheckCircle2 size={40} style={{ color: '#4ADE80' }} />
                  </div>
                  <h2 className="font-cinzel text-xl font-bold" style={{ color: '#4ADE80' }}>
                    MFA ativado com sucesso!
                  </h2>
                  <p className="mt-2 text-sm font-lato" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Redirecionando...
                  </p>
                </>
              ) : (
                <>
                  <div
                    className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4"
                    style={{ backgroundColor: 'rgba(183,154,90,0.12)', border: `1px solid ${COR_OURO}` }}
                  >
                    <ShieldCheck size={32} style={{ color: COR_OURO }} />
                  </div>
                  <h2 className="font-cinzel text-xl font-bold text-white">
                    Verificar Configuração
                  </h2>
                  <p className="mt-2 text-sm font-lato" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Digite o código de 6 dígitos gerado pelo seu aplicativo autenticador
                  </p>
                </>
              )}
            </div>

            {!verificacaoOk && (
              <>
                <div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={codigo}
                    onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    autoFocus
                    className="w-full text-center text-3xl font-mono tracking-[0.5em] py-4 rounded-lg
                               outline-none transition-all"
                    style={{
                      backgroundColor: 'rgba(14,27,42,0.8)',
                      border: `2px solid ${erro ? '#EF4444' : 'rgba(183,154,90,0.4)'}`,
                      color: '#E2E8F0',
                      caretColor: COR_OURO,
                    }}
                    onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = COR_OURO }}
                    onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = erro ? '#EF4444' : 'rgba(183,154,90,0.4)' }}
                  />
                </div>

                {erro && (
                  <div
                    className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm font-lato"
                    style={{ backgroundColor: 'rgba(90,18,32,0.4)', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }}
                  >
                    <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <p>{erro}</p>
                      {tentativasRestantes !== null && (
                        <p
                          className="mt-1 text-xs font-semibold"
                          style={{ color: tentativasRestantes <= 2 ? '#F87171' : '#FCA5A5' }}
                        >
                          {tentativasRestantes} tentativa{tentativasRestantes !== 1 ? 's' : ''} restante{tentativasRestantes !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleVerificar}
                  disabled={loading || codigo.length !== 6}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg
                             font-montserrat font-semibold text-sm text-white transition-all
                             disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: COR_VINHO }}
                  onMouseEnter={e => { if (!loading && codigo.length === 6) (e.currentTarget as HTMLButtonElement).style.backgroundColor = COR_OURO }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = COR_VINHO }}
                >
                  {loading ? (
                    <><Loader2 size={16} className="animate-spin" /> Verificando...</>
                  ) : (
                    <><ShieldCheck size={16} /> Verificar e Ativar</>
                  )}
                </button>

                <button
                  onClick={() => setEtapa(2)}
                  className="w-full py-2 text-sm font-montserrat transition-opacity hover:opacity-70"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  â Voltar ao QR Code
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
