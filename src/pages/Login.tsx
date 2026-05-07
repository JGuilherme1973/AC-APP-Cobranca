/**
 * Login.tsx — Tela de autenticação institucional
 * VINDEX | Sistema de Cobranças
 *
 * Identidade visual VINDEX: fundo navy (#0E1B2A / #06101a),
 * tipografia Cinzel (títulos), Montserrat (labels), Lato (corpo).
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, AlertCircle } from 'lucide-react'
import { useAuth } from '@/hooks/auth/useAuth'
import VerificarMFA from '@/components/auth/VerificarMFA'
import ConfigurarMFA from '@/components/auth/ConfigurarMFA'
import VindexLogo from '@/components/brand/VindexLogo'

interface FormState {
  email: string
  password: string
  loading: boolean
  error: string | null
  showPassword: boolean
}

export default function Login() {
  const navigate = useNavigate()
  const auth = useAuth()
  const [form, setForm] = useState<FormState>({
    email: '',
    password: '',
    loading: false,
    error: null,
    showPassword: false,
  })

  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)

  const handleChange = useCallback(
    (field: keyof Pick<FormState, 'email' | 'password'>) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(prev => ({ ...prev, [field]: e.target.value, error: null }))
      },
    [],
  )

  const toggleShowPassword = useCallback(() => {
    setForm(prev => ({ ...prev, showPassword: !prev.showPassword }))
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!form.email || !form.password) {
      setForm(prev => ({ ...prev, error: 'Preencha e-mail e senha para continuar.' }))
      return
    }

    setForm(prev => ({ ...prev, loading: true, error: null }))

    try {
      const resultado = await auth.login(form.email, form.password)

      if (resultado.erro) {
        setForm(prev => ({ ...prev, loading: false, error: resultado.erro ?? null }))
        return
      }

      setForm(prev => ({ ...prev, loading: false }))

      // Se não há MFA pendente ou a ser configurado, navegar direto
      // (MFA pendente/não configurado será tratado pelos overlays abaixo)
      if (!auth.mfaPendente && !auth.mfaNaoConfigurado) {
        navigate('/cobranca')
      }
    } catch {
      setForm(prev => ({
        ...prev,
        loading: false,
        error: 'Falha de conexão. Verifique sua internet e tente novamente.',
      }))
    }
  }

  // ── Overlay: verificação MFA ──────────────────────────────
  if (auth.mfaPendente && auth.user) {
    return (
      <div className="fixed inset-0 z-50" style={{ backgroundColor: '#060e18' }}>
        <VerificarMFA
          usuario_id={auth.user.id}
          onVerificado={() => navigate('/cobranca')}
          onCancelar={async () => {
            await auth.logout()
            navigate('/login')
          }}
        />
      </div>
    )
  }

  // ── Overlay: configuração MFA ─────────────────────────────
  if (auth.mfaNaoConfigurado && auth.user) {
    return (
      <div className="fixed inset-0 z-50" style={{ backgroundColor: '#060e18' }}>
        <ConfigurarMFA
          usuario_id={auth.user.id}
          onConcluido={() => navigate('/cobranca')}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">

      {/* ── COLUNA ESQUERDA — Branding (60%) ─────────────────── */}
      <div
        className="hidden md:flex md:w-3/5 flex-col relative"
        style={{ backgroundColor: '#0E1B2A' }}
        aria-hidden="true"
      >
        {/* Linha vertical dourada decorativa — borda direita */}
        <div
          className="absolute right-0 top-0 bottom-0 w-px"
          style={{ background: 'linear-gradient(to bottom, transparent, rgba(183,154,90,0.3), transparent)' }}
        />

        {/* Centro: logo + tagline */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <VindexLogo variant="vertical" theme="dark" size="xl" />

          {/* Linha dourada decorativa */}
          <div
            style={{
              width: 160,
              height: 1,
              backgroundColor: '#B79A5A',
              marginTop: 32,
            }}
          />

          {/* Tagline */}
          <p
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 10,
              letterSpacing: 3,
              color: '#B79A5A',
              opacity: 0.7,
              textAlign: 'center',
              marginTop: 16,
            }}
          >
            DIREITO QUE RECUPERA. ESTRATÉGIA QUE PROTEGE.
          </p>
        </div>

        {/* Rodapé da coluna */}
        <p
          style={{
            fontFamily: "'Lato', sans-serif",
            fontWeight: 300,
            fontSize: 10,
            color: '#444',
            textAlign: 'center',
            paddingBottom: 20,
          }}
        >
          © 2026 ANDRADE &amp; CINTRA Advogados
        </p>
      </div>

      {/* ── COLUNA DIREITA — Formulário (40%) ────────────────── */}
      <div
        className="flex-1 md:w-2/5 flex flex-col items-center justify-center min-h-screen md:min-h-0"
        style={{ backgroundColor: '#06101a' }}
      >
        {/* Logo mobile (visível apenas em telas pequenas) */}
        <div className="md:hidden flex flex-col items-center" style={{ paddingTop: 48, marginBottom: 32 }}>
          <VindexLogo variant="vertical" theme="dark" size="lg" />
        </div>

        {/* Card de login */}
        <div
          className="w-full mx-auto"
          style={{
            background: '#0a1420',
            border: '1px solid rgba(183,154,90,0.2)',
            borderRadius: 12,
            padding: '40px 36px',
            maxWidth: 360,
            margin: '0 20px',
          }}
        >
          {/* Título */}
          <h2
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 18,
              color: '#F6F2EC',
              marginBottom: 8,
              margin: 0,
            }}
          >
            Entrar no VINDEX
          </h2>

          {/* Subtítulo */}
          <p
            style={{
              fontFamily: "'Lato', sans-serif",
              fontWeight: 300,
              fontSize: 12,
              color: '#666',
              marginBottom: 32,
              marginTop: 8,
            }}
          >
            Acesso restrito — escritório interno
          </p>

          <form onSubmit={handleSubmit} noValidate>
            {/* Alerta de erro */}
            {form.error && (
              <div
                className="flex items-start gap-3 rounded px-4 py-3 mb-5 text-sm"
                style={{
                  backgroundColor: 'rgba(90,18,32,0.3)',
                  border: '1px solid rgba(90,18,32,0.6)',
                  color: '#f87171',
                  fontFamily: "'Lato', sans-serif",
                }}
                role="alert"
              >
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{form.error}</span>
              </div>
            )}

            {/* Campo e-mail */}
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 11,
                  color: '#B79A5A',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                E-mail
              </label>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    right: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 12,
                    pointerEvents: 'none',
                  }}
                >
                  <Mail size={15} style={{ color: form.email ? '#B79A5A' : '#3a4a5a' }} />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={handleChange('email')}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  placeholder="seu@email.com.br"
                  disabled={form.loading}
                  style={{
                    background: '#06101a',
                    border: `1px solid ${emailFocused ? '#B79A5A' : 'rgba(183,154,90,0.2)'}`,
                    borderRadius: 6,
                    color: '#F6F2EC',
                    padding: '12px 14px 12px 36px',
                    width: '100%',
                    fontFamily: "'Lato', sans-serif",
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                    opacity: form.loading ? 0.6 : 1,
                    transition: 'border-color 150ms',
                  }}
                />
              </div>
            </div>

            {/* Campo senha */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label
                  htmlFor="password"
                  style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: 11,
                    color: '#B79A5A',
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}
                >
                  Senha
                </label>
                <button
                  type="button"
                  style={{
                    fontFamily: "'Lato', sans-serif",
                    fontSize: 12,
                    color: '#666',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#B79A5A' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#666' }}
                  tabIndex={-1}
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    right: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 12,
                    pointerEvents: 'none',
                  }}
                >
                  <Lock size={15} style={{ color: form.password ? '#B79A5A' : '#3a4a5a' }} />
                </div>
                <input
                  id="password"
                  type={form.showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleChange('password')}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  placeholder="••••••••"
                  disabled={form.loading}
                  style={{
                    background: '#06101a',
                    border: `1px solid ${passwordFocused ? '#B79A5A' : 'rgba(183,154,90,0.2)'}`,
                    borderRadius: 6,
                    color: '#F6F2EC',
                    padding: '12px 40px 12px 36px',
                    width: '100%',
                    fontFamily: "'Lato', sans-serif",
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                    opacity: form.loading ? 0.6 : 1,
                    transition: 'border-color 150ms',
                  }}
                />
                <button
                  type="button"
                  onClick={toggleShowPassword}
                  disabled={form.loading}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    left: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    paddingRight: 12,
                    color: '#3a4a5a',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    opacity: form.loading ? 0.4 : 1,
                  }}
                  aria-label={form.showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {form.showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Botão de acesso */}
            <button
              type="submit"
              disabled={form.loading}
              style={{
                background: form.loading ? '#8B3A47' : '#5A1220',
                color: '#F6F2EC',
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 2,
                borderRadius: 6,
                padding: 14,
                width: '100%',
                border: 'none',
                cursor: form.loading ? 'not-allowed' : 'pointer',
                transition: 'background 200ms, color 200ms',
              }}
              onMouseEnter={e => {
                if (!form.loading) {
                  const el = e.currentTarget as HTMLButtonElement
                  el.style.background = '#B79A5A'
                  el.style.color = '#0E1B2A'
                }
              }}
              onMouseLeave={e => {
                if (!form.loading) {
                  const el = e.currentTarget as HTMLButtonElement
                  el.style.background = '#5A1220'
                  el.style.color = '#F6F2EC'
                }
              }}
            >
              {form.loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg
                    className="animate-spin"
                    style={{ width: 16, height: 16 }}
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      style={{ opacity: 0.25 }}
                      cx="12" cy="12" r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      style={{ opacity: 0.75 }}
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Autenticando...
                </span>
              ) : (
                'ENTRAR'
              )}
            </button>
          </form>
        </div>

        {/* Padding inferior mobile */}
        <div style={{ height: 40 }} className="md:hidden" />
      </div>
    </div>
  )
}
