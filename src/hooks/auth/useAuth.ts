/**
 * useAuth.ts — Hook de autenticação com suporte a MFA
 * ANDRADE & CINTRA Advogados | Sistema de Cobranças
 *
 * Gerencia o fluxo completo de login:
 *   - Autenticação básica (email + senha)
 *   - MFA obrigatório para ADMIN e ADVOGADO
 *   - Registro de auditoria para login e MFA
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { verificarMFA } from '@/lib/seguranca/mfa'

// ─── Tipos públicos ───────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  role: 'ADMIN' | 'ADVOGADO' | 'ASSISTENTE' | 'CLIENTE'
  nome: string
}

export interface UseAuthReturn {
  user: AuthUser | null
  loading: boolean
  mfaPendente: boolean
  mfaNaoConfigurado: boolean
  login: (email: string, password: string) => Promise<{ erro?: string }>
  logout: () => Promise<void>
  completarMFA: (codigo: string) => Promise<{ sucesso: boolean; erro?: string }>
  getMfaNecessario: () => boolean
}

// ─── Chaves de sessionStorage ─────────────────────────────────
const SS_MFA_PENDENTE = 'mfa_pendente'
const SS_USER_ID = 'user_id'

// ─── Hook ─────────────────────────────────────────────────────
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [mfaPendente, setMfaPendente] = useState(false)
  const [mfaNaoConfigurado, setMfaNaoConfigurado] = useState(false)

  // ── Carregar usuário da sessão existente ──────────────────
  useEffect(() => {
    let cancelled = false

    async function carregarUsuario() {
      try {
        const { data: { user: supaUser } } = await supabase.auth.getUser()
        if (!supaUser || cancelled) {
          if (!cancelled) setLoading(false)
          return
        }

        const { data: usuario } = await supabase
          .from('usuarios')
          .select('id, nome, email, role')
          .eq('id', supaUser.id)
          .maybeSingle()

        if (!usuario || cancelled) {
          if (!cancelled) setLoading(false)
          return
        }

        if (!cancelled) {
          setUser({
            id: usuario.id as string,
            email: usuario.email as string,
            nome: usuario.nome as string,
            role: usuario.role as AuthUser['role'],
          })

          // Restaurar estado de MFA pendente da sessão
          const mfaPendenteFlag = sessionStorage.getItem(SS_MFA_PENDENTE)
          const mfaUserId = sessionStorage.getItem(SS_USER_ID)
          if (mfaPendenteFlag === 'true' && mfaUserId === supaUser.id) {
            setMfaPendente(true)
          }
        }
      } catch {
        // ignora erros silenciosamente
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    carregarUsuario()
    return () => { cancelled = true }
  }, [])

  // ── Login ─────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string): Promise<{ erro?: string }> => {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (authError || !authData.user) {
        // Auditoria de falha (sem expor motivo)
        await supabase.from('auditoria').insert({
          acao: 'LOGIN_FALHA',
          entidade: 'usuarios',
          dados_depois: { email_tentativa: email.trim().toLowerCase() },
        })
        return { erro: 'Credenciais inválidas. Verifique e tente novamente.' }
      }

      const supaUser = authData.user

      // Buscar perfil do usuário
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('id, nome, email, role')
        .eq('id', supaUser.id)
        .maybeSingle()

      if (!usuario) {
        await supabase.auth.signOut()
        return { erro: 'Perfil de usuário não encontrado. Contate o administrador.' }
      }

      const role = usuario.role as AuthUser['role']
      const authUser: AuthUser = {
        id: usuario.id as string,
        email: usuario.email as string,
        nome: usuario.nome as string,
        role,
      }

      // Auditoria de sucesso
      await supabase.from('auditoria').insert({
        acao: 'LOGIN_SUCESSO',
        entidade: 'usuarios',
        entidade_id: supaUser.id,
        dados_depois: { role, email: authUser.email },
      })

      setUser(authUser)

      // Roles que requerem MFA
      if (role === 'ADMIN' || role === 'ADVOGADO') {
        // Verificar se MFA já está configurado
        const { data: mfaSecret } = await supabase
          .from('dados_sensiveis_enc')
          .select('id')
          .eq('entidade', 'usuario')
          .eq('entidade_id', supaUser.id)
          .eq('campo', 'mfa_secret')
          .maybeSingle()

        // Salvar flags de MFA no sessionStorage
        sessionStorage.setItem(SS_MFA_PENDENTE, 'true')
        sessionStorage.setItem(SS_USER_ID, supaUser.id)

        if (mfaSecret) {
          // MFA configurado — aguardar verificação
          setMfaPendente(true)
        } else {
          // MFA não configurado — encaminhar para setup
          setMfaNaoConfigurado(true)
        }
      }

      // ASSISTENTE e CLIENTE: nenhuma ação adicional — navigate fica a cargo do chamador
      return {}
    } catch {
      return { erro: 'Falha de conexão. Verifique sua internet e tente novamente.' }
    }
  }, [])

  // ── Logout ────────────────────────────────────────────────
  const logout = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut()
    sessionStorage.removeItem(SS_MFA_PENDENTE)
    sessionStorage.removeItem(SS_USER_ID)
    setUser(null)
    setMfaPendente(false)
    setMfaNaoConfigurado(false)
  }, [])

  // ── Completar MFA ─────────────────────────────────────────
  const completarMFA = useCallback(async (codigo: string): Promise<{ sucesso: boolean; erro?: string }> => {
    const userId = sessionStorage.getItem(SS_USER_ID) ?? user?.id
    if (!userId) {
      return { sucesso: false, erro: 'Sessão inválida. Faça login novamente.' }
    }

    try {
      const resultado = await verificarMFA(userId, codigo)

      if (resultado.sucesso) {
        // Limpar flags de MFA
        sessionStorage.removeItem(SS_MFA_PENDENTE)
        sessionStorage.removeItem(SS_USER_ID)
        setMfaPendente(false)
        setMfaNaoConfigurado(false)

        // Auditoria MFA verificado
        await supabase.from('auditoria').insert({
          acao: 'MFA_VERIFICADO',
          entidade: 'usuarios',
          entidade_id: userId,
          dados_depois: { verificado_em: new Date().toISOString() },
        })

        return { sucesso: true }
      }

      if (resultado.bloqueado) {
        return {
          sucesso: false,
          erro: resultado.erro ?? 'Conta bloqueada temporariamente por excesso de tentativas.',
        }
      }

      return { sucesso: false, erro: resultado.erro ?? 'Código inválido.' }
    } catch {
      return { sucesso: false, erro: 'Erro ao verificar código. Tente novamente.' }
    }
  }, [user])

  // ── Helper: role requer MFA? ──────────────────────────────
  const getMfaNecessario = useCallback((): boolean => {
    return user?.role === 'ADMIN' || user?.role === 'ADVOGADO'
  }, [user])

  return {
    user,
    loading,
    mfaPendente,
    mfaNaoConfigurado,
    login,
    logout,
    completarMFA,
    getMfaNecessario,
  }
}
