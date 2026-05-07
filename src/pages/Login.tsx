/**
 * Login.tsx — Tela de autenticação institucional
 * ANDRADE & CINTRA Advogados | Sistema de Cobranças
 *
 * Identidade visual: fundo navy (#0D1B2A), logotipo A&C,
 * tipografia Cinzel (títulos), Montserrat (labels), Lato (corpo).
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, AlertCircle, Scale } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface FormState {
  email: string
  password: string
  loading: boolean
  error: string | null
  showPassword: boolean
}

// Escudo SVG — brasão estilizado A&C
function LogoAC() {
  return (
    <svg
      viewBox="0 0 120 140"
      className="w-24 h-28"
      aria-label="ANDRADE & CINTRA Advogados"
      role="img"
    >
      {/* Fundo do escudo */}
      <path
        d="M60 4 L112 28 L112 84 Q112 120 60 136 Q8 120 8 84 L8 28 Z"
        fill="#5A1E2A"
        stroke="#B89C5C"
        strokeWidth="2"
      />
      {/* Traço interno do escudo */}
      <path
        d="M60 14 L102 34 L102 82 Q102 112 60 126 Q18 112 18 82 L18 34 Z"
        fill="none"
        stroke="#B89C5C"
        strokeWidth="1"
        opacity="0.5"
      />
      {/* Letras A&C */}
      <text
        x="60"
        y="72"
        textAnchor="middle"
        fontFamily="'Cinzel', serif"
        fontSize="36"
        fontWeight="700"
        fill="#B89C5C"
        letterSpacing="2"
      >
        A
      </text>
      <text
        x="60"
        y="100"
        textAnchor="middle"
        fontFamily="'Cinzel', serif"
        fontSize="16"
        fontWeight="400"
        fill="#B89C5C"
        letterSpacing="3"
      >
        &amp; C
      </text>
      {/* Ornamento inferior */}
      <line x1="34" y1="108" x2="86" y2="108" stroke="#B89C5C" strokeWidth="0.5" opacity="0.6" />
    </svg>
  )
}

// Separador decorativo dourado
function DividerOuro() {
  return (
    <div className="flex items-center gap-3 w-full">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#B89C5C] opacity-40" />
      <Scale size={14} className="text-[#B89C5C] opacity-60 flex-shrink-0" />
      <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#B89C5C] opacity-40" />
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>({
    email: '',
    password: '',
    loading: false,
    error: null,
    showPassword: false,
  })

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
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      })

      if (error) {
        const msg =
          error.message === 'Invalid login credentials'
            ? 'E-mail ou senha inválidos. Verifique suas credenciais.'
            : error.message === 'Email not confirmed'
              ? 'Confirme seu e-mail antes de acessar o sistema.'
              : 'Erro ao autenticar. Tente novamente.'
        setForm(prev => ({ ...prev, loading: false, error: msg }))
        return
      }

      navigate('/cobranca')
    } catch {
      setForm(prev => ({
        ...prev,
        loading: false,
        error: 'Falha de conexão. Verifique sua internet e tente novamente.',
      }))
    }
  }

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: '#0D1B2A' }}
    >
      {/* ── Painel esquerdo — Branding ─────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-1/2 flex-col items-center justify-center px-12 relative overflow-hidden"
        style={{ backgroundColor: '#0D1B2A' }}
        aria-hidden="true"
      >
        {/* Textura de fundo sutil */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #B89C5C 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }}
        />

        {/* Linha vertical dourada decorativa */}
        <div
          className="absolute right-0 top-0 bottom-0 w-px opacity-20"
          style={{ background: 'linear-gradient(to bottom, transparent, #B89C5C, transparent)' }}
        />

        <div className="relative z-10 text-center max-w-sm">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <LogoAC />
          </div>

          {/* Nome do escritório */}
          <h1
            className="text-3xl font-cinzel font-bold tracking-widest mb-2"
            style={{ color: '#B89C5C' }}
          >
            ANDRADE
          </h1>
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="h-px w-8 opacity-40" style={{ backgroundColor: '#B89C5C' }} />
            <span className="font-cinzel text-sm tracking-[0.4em] opacity-60" style={{ color: '#B89C5C' }}>
              &amp;
            </span>
            <div className="h-px w-8 opacity-40" style={{ backgroundColor: '#B89C5C' }} />
          </div>
          <h1
            className="text-3xl font-cinzel font-bold tracking-widest mb-6"
            style={{ color: '#B89C5C' }}
          >
            CINTRA
          </h1>

          <p
            className="font-montserrat text-xs font-medium tracking-[0.25em] uppercase mb-10 opacity-50"
            style={{ color: '#C0C0C0' }}
          >
            Advogados
          </p>

          <DividerOuro />

          <p
            className="mt-8 font-lato text-sm leading-relaxed opacity-50"
            style={{ color: '#C0C0C0' }}
          >
            Sistema interno de gestão de cobranças
            <br />e execuções judiciais.
          </p>

          {/* OAB */}
          <p
            className="mt-6 font-montserrat text-xs tracking-wider opacity-30"
            style={{ color: '#C0C0C0' }}
          >
            OAB/SP — Uso exclusivo do escritório
          </p>
        </div>
      </div>

      {/* ── Painel direito — Formulário ────────────────────────── */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 py-12"
        style={{ backgroundColor: '#0F2033' }}
      >
        {/* Logo mobile */}
        <div className="flex flex-col items-center mb-10 lg:hidden">
          <LogoAC />
          <h1
            className="mt-4 font-cinzel text-xl font-bold tracking-widest"
            style={{ color: '#B89C5C' }}
          >
            ANDRADE &amp; CINTRA
          </h1>
          <p className="font-montserrat text-xs mt-1 opacity-40 tracking-wider"
            style={{ color: '#C0C0C0' }}>
            Advogados
          </p>
        </div>

        {/* Card do formulário */}
        <div
          className="w-full max-w-md rounded-lg shadow-2xl overflow-hidden"
          style={{ backgroundColor: '#FAFAF8' }}
        >
          {/* Cabeçalho do card */}
          <div
            className="px-8 pt-8 pb-6"
            style={{ borderBottom: '1px solid #E2D9C8' }}
          >
            <h2
              className="font-cinzel text-xl font-semibold"
              style={{ color: '#5A1E2A' }}
            >
              Acesso ao Sistema
            </h2>
            <p
              className="mt-1 font-lato text-sm"
              style={{ color: '#6B6B6B' }}
            >
              Insira suas credenciais para continuar.
            </p>
          </div>

          {/* Corpo do formulário */}
          <form onSubmit={handleSubmit} noValidate className="px-8 pt-6 pb-8">
            {/* Alerta de erro */}
            {form.error && (
              <div
                className="flex items-start gap-3 rounded px-4 py-3 mb-5 text-sm font-lato"
                style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#991B1B',
                }}
                role="alert"
              >
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{form.error}</span>
              </div>
            )}

            {/* Campo e-mail */}
            <div className="mb-5">
              <label
                htmlFor="email"
                className="block font-montserrat text-xs font-semibold uppercase tracking-wide mb-1.5"
                style={{ color: '#1A1A1A' }}
              >
                E-mail
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Mail
                    size={16}
                    style={{ color: form.email ? '#5A1E2A' : '#C0C0C0' }}
                  />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={handleChange('email')}
                  placeholder="seu@email.com.br"
                  disabled={form.loading}
                  className="w-full border rounded pl-9 pr-4 py-2.5 text-sm font-lato
                             transition-colors disabled:opacity-60 disabled:cursor-not-allowed
                             focus:outline-none focus:ring-2"
                  style={{
                    borderColor: form.error ? '#FECACA' : '#E2D9C8',
                    backgroundColor: '#FFFFFF',
                    color: '#1A1A1A',
                    '--tw-ring-color': '#5A1E2A',
                  } as React.CSSProperties}
                />
              </div>
            </div>

            {/* Campo senha */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="font-montserrat text-xs font-semibold uppercase tracking-wide"
                  style={{ color: '#1A1A1A' }}
                >
                  Senha
                </label>
                <button
                  type="button"
                  className="font-lato text-xs transition-colors hover:underline"
                  style={{ color: '#B89C5C' }}
                  tabIndex={-1}
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Lock
                    size={16}
                    style={{ color: form.password ? '#5A1E2A' : '#C0C0C0' }}
                  />
                </div>
                <input
                  id="password"
                  type={form.showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleChange('password')}
                  placeholder="••••••••"
                  disabled={form.loading}
                  className="w-full border rounded pl-9 pr-10 py-2.5 text-sm font-lato
                             transition-colors disabled:opacity-60 disabled:cursor-not-allowed
                             focus:outline-none focus:ring-2"
                  style={{
                    borderColor: form.error ? '#FECACA' : '#E2D9C8',
                    backgroundColor: '#FFFFFF',
                    color: '#1A1A1A',
                    '--tw-ring-color': '#5A1E2A',
                  } as React.CSSProperties}
                />
                <button
                  type="button"
                  onClick={toggleShowPassword}
                  disabled={form.loading}
                  className="absolute inset-y-0 right-0 flex items-center pr-3
                             transition-colors hover:opacity-80 disabled:opacity-40"
                  style={{ color: '#C0C0C0' }}
                  aria-label={form.showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {form.showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Botão de acesso */}
            <button
              type="submit"
              disabled={form.loading}
              className="w-full rounded py-3 text-sm font-montserrat font-semibold tracking-wide
                         text-white transition-all duration-200 disabled:cursor-not-allowed
                         focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{
                backgroundColor: form.loading ? '#8B3A47' : '#5A1E2A',
                '--tw-ring-color': '#5A1E2A',
              } as React.CSSProperties}
              onMouseEnter={e => {
                if (!form.loading) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B89C5C'
                }
              }}
              onMouseLeave={e => {
                if (!form.loading) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#5A1E2A'
                }
              }}
            >
              {form.loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12" cy="12" r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Autenticando...
                </span>
              ) : (
                'Entrar no Sistema'
              )}
            </button>

            {/* Nota de segurança */}
            <p
              className="mt-5 text-center font-lato text-xs opacity-50"
              style={{ color: '#6B6B6B' }}
            >
              Acesso restrito a usuários autorizados do escritório.
              <br />
              Sessões inativas expiram em 8 horas.
            </p>
          </form>
        </div>

        {/* Rodapé */}
        <div className="mt-8 text-center">
          <p
            className="font-lato text-xs opacity-30"
            style={{ color: '#C0C0C0' }}
          >
            © {new Date().getFullYear()} ANDRADE &amp; CINTRA Advogados — Todos os direitos reservados
          </p>
          <p
            className="mt-1 font-lato text-xs opacity-20"
            style={{ color: '#C0C0C0' }}
          >
            jgac@cintraadvogados.com.br · OAB/SP
          </p>
        </div>
      </div>
    </div>
  )
}
