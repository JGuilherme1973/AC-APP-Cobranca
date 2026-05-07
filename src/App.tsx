import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import Login from '@/pages/Login'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard          from '@/components/cobranca/Dashboard'
import NovoCaso           from '@/components/cobranca/NovoCaso'
import FichaCaso          from '@/components/cobranca/FichaCaso'
import ListaCasos         from '@/components/cobranca/ListaCasos'
import ConfiguracaoRegua  from '@/components/cobranca/ConfiguracaoRegua'
import PortalNegociacao   from '@/pages/negociar/PortalNegociacao'
import ConfigurarMFA      from '@/components/auth/ConfigurarMFA'
import VerificarMFA       from '@/components/auth/VerificarMFA'

// Guard para rotas MFA — requer user_id no sessionStorage
function MFARoute({ children }: { children: (userId: string) => React.ReactNode }) {
  const userId = sessionStorage.getItem('user_id')
  if (!userId) return <Navigate to="/login" replace />
  return <>{children(userId)}</>
}

// Guard de rota autenticada
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [navigate])

  // Loading inicial da sessão
  if (session === undefined) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#0D1B2A' }}
      >
        <div
          className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: '#5A1E2A', borderTopColor: '#B89C5C' }}
        />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

// Placeholder reutilizável para rotas ainda não construídas
function EmConstrucao({ titulo }: { titulo: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <h2 className="font-cinzel text-xl font-bold" style={{ color: '#5A1E2A' }}>{titulo}</h2>
      <p className="font-lato text-sm" style={{ color: '#9B9B9B' }}>
        Módulo em construção — MVP em andamento
      </p>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/negociar/:token" element={<PortalNegociacao />} />

      {/* Autenticadas — dentro do AppLayout */}
      <Route
        path="/cobranca"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Dashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cobranca/casos"
        element={
          <ProtectedRoute>
            <AppLayout><ListaCasos /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cobranca/novo-caso"
        element={
          <ProtectedRoute>
            <AppLayout><NovoCaso /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cobranca/casos/:id"
        element={
          <ProtectedRoute>
            <AppLayout><FichaCaso /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cobranca/credores"
        element={
          <ProtectedRoute>
            <AppLayout><EmConstrucao titulo="Credores" /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cobranca/devedores"
        element={
          <ProtectedRoute>
            <AppLayout><EmConstrucao titulo="Devedores" /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cobranca/comunicacoes"
        element={
          <ProtectedRoute>
            <AppLayout><EmConstrucao titulo="Comunicações" /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cobranca/prazos"
        element={
          <ProtectedRoute>
            <AppLayout><EmConstrucao titulo="Calendário de Prazos" /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cobranca/tarefas"
        element={
          <ProtectedRoute>
            <AppLayout><EmConstrucao titulo="Tarefas" /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cobranca/relatorios"
        element={
          <ProtectedRoute>
            <AppLayout><EmConstrucao titulo="Relatórios" /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cobranca/configuracoes"
        element={
          <ProtectedRoute>
            <AppLayout><EmConstrucao titulo="Configurações" /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cobranca/regua"
        element={
          <ProtectedRoute>
            <AppLayout><ConfiguracaoRegua /></AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Rotas de MFA — requerem sessão Supabase + user_id no sessionStorage */}
      <Route
        path="/auth/configurar-mfa"
        element={
          <ProtectedRoute>
            <MFARoute>
              {(userId) => (
                <ConfigurarMFA
                  usuario_id={userId}
                  onConcluido={() => {
                    sessionStorage.removeItem('mfa_pendente')
                    sessionStorage.removeItem('user_id')
                    window.location.replace('/cobranca')
                  }}
                />
              )}
            </MFARoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/auth/verificar-mfa"
        element={
          <ProtectedRoute>
            <MFARoute>
              {(userId) => (
                <VerificarMFA
                  usuario_id={userId}
                  onVerificado={() => {
                    sessionStorage.removeItem('mfa_pendente')
                    sessionStorage.removeItem('user_id')
                    window.location.replace('/cobranca')
                  }}
                  onCancelar={() =>
                    supabase.auth.signOut().then(() => {
                      sessionStorage.removeItem('mfa_pendente')
                      sessionStorage.removeItem('user_id')
                      window.location.replace('/login')
                    })
                  }
                />
              )}
            </MFARoute>
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
