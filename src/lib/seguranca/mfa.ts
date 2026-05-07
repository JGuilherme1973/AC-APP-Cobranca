/**
 * MFA — Autenticação de Dois Fatores (TOTP) com otplib
 *
 * Pré-requisito: npm install otplib
 *
 * O segredo TOTP é armazenado criptografado em dados_sensiveis_enc
 * (campo 'mfa_secret', entidade 'usuario').
 * Códigos de backup são armazenados em dados_sensiveis_enc (campo 'mfa_backup_codes').
 * A tabela sessoes_mfa controla lockout e timestamps de verificação.
 */

import { authenticator } from 'otplib'
import { supabase } from '@/lib/supabase'
import { salvarDadoSensivel, recuperarDadoSensivel } from './criptografia'
import { registrarAuditoria } from '@/lib/lgpd/auditoria'

export interface MFASetup {
  secret: string           // segredo TOTP em claro (exibir ao usuário apenas uma vez)
  qr_uri: string           // otpauth URI para geração do QR Code
  backup_codes: string[]   // 10 códigos de uso único
}

export interface MFAVerificacaoResult {
  sucesso: boolean
  tentativas_restantes?: number
  bloqueado?: boolean
  bloqueado_ate?: string
  erro?: string
}

export interface LockoutStatus {
  bloqueado: boolean
  tentativas_restantes?: number
  liberado_em?: Date
}

// ---------------------------------------------------------------------------
// 1. Configurar MFA
// ---------------------------------------------------------------------------
export async function configurarMFA(usuario_id: string): Promise<MFASetup> {
  // Buscar e-mail do usuário para label do QR Code
  let email = usuario_id
  try {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('email')
      .eq('id', usuario_id)
      .maybeSingle()
    if (usuario?.email) {
      email = usuario.email as string
    }
  } catch {
    // usa usuario_id como fallback
  }

  // Gerar segredo TOTP
  const secret = authenticator.generateSecret()

  // Construir URI para QR Code
  const qr_uri = authenticator.keyuri(email, 'VINDEX — ANDRADE & CINTRA', secret)

  // Gerar 10 códigos de backup alfanuméricos de 8 caracteres
  const backup_codes: string[] = Array.from({ length: 10 }, () =>
    Math.random().toString(36).slice(2, 10).toUpperCase()
  )

  // Persistir segredo criptografado em dados_sensiveis_enc
  await salvarDadoSensivel('usuario', usuario_id, 'mfa_secret', secret)

  // Persistir códigos de backup criptografados
  await salvarDadoSensivel(
    'usuario',
    usuario_id,
    'mfa_backup_codes',
    JSON.stringify(backup_codes)
  )

  // Criar/resetar registro em sessoes_mfa
  await supabase.from('sessoes_mfa').upsert(
    {
      usuario_id,
      tentativas_falhas: 0,
      bloqueado_ate: null,
      ultimo_mfa_em: null,
    },
    { onConflict: 'usuario_id' }
  )

  await registrarAuditoria({
    usuario_id,
    acao: 'MFA_CONFIGURADO',
    entidade: 'sessoes_mfa',
    entidade_id: usuario_id,
  })

  return { secret, qr_uri, backup_codes }
}

// ---------------------------------------------------------------------------
// 2. Verificar código MFA (TOTP ou backup)
// ---------------------------------------------------------------------------
export async function verificarMFA(
  usuario_id: string,
  codigo: string,
  ip_address?: string
): Promise<MFAVerificacaoResult> {
  // Verificar lockout antes de qualquer coisa
  const lockout = await verificarLockout(usuario_id)
  if (lockout.bloqueado) {
    return {
      sucesso: false,
      bloqueado: true,
      bloqueado_ate: lockout.liberado_em?.toISOString(),
      erro: `MFA bloqueado — aguarde até ${lockout.liberado_em?.toLocaleTimeString('pt-BR') ?? 'liberação automática'}`,
    }
  }

  // Recuperar segredo
  const secret = await recuperarDadoSensivel('usuario', usuario_id, 'mfa_secret')
  if (!secret) {
    throw new Error('MFA não configurado para este usuário')
  }

  // Tentar verificação TOTP
  let valido = false
  try {
    valido = authenticator.verify({ token: codigo, secret })
  } catch {
    valido = false
  }

  // Se TOTP falhou, verificar códigos de backup
  if (!valido) {
    valido = await verificarCodigoBackup(usuario_id, codigo)
  }

  if (valido) {
    // Sucesso: zerar tentativas e registrar timestamp
    await supabase.from('sessoes_mfa').upsert(
      {
        usuario_id,
        tentativas_falhas: 0,
        bloqueado_ate: null,
        ultimo_mfa_em: new Date().toISOString(),
        ip_address: ip_address ?? null,
      },
      { onConflict: 'usuario_id' }
    )

    await registrarAuditoria({
      usuario_id,
      acao: 'MFA_VERIFICADO',
      entidade: 'sessoes_mfa',
      entidade_id: usuario_id,
      ip_address,
    })

    return { sucesso: true }
  }

  // Falha: incrementar tentativas e aplicar lockout se necessário
  const { data: sessao } = await supabase
    .from('sessoes_mfa')
    .select('tentativas_falhas')
    .eq('usuario_id', usuario_id)
    .maybeSingle()

  const tentativasAtuais = (sessao?.tentativas_falhas as number | null) ?? 0
  const novasTentativas = tentativasAtuais + 1
  const MAX_TENTATIVAS = 5
  let bloqueado_ate: string | null = null

  if (novasTentativas >= MAX_TENTATIVAS) {
    // Bloquear por 15 minutos
    const liberacao = new Date(Date.now() + 15 * 60 * 1000)
    bloqueado_ate = liberacao.toISOString()

    await registrarAuditoria({
      usuario_id,
      acao: 'MFA_LOCKOUT',
      entidade: 'sessoes_mfa',
      entidade_id: usuario_id,
      dados_depois: { tentativas: novasTentativas, bloqueado_ate },
      ip_address,
    })
  } else {
    await registrarAuditoria({
      usuario_id,
      acao: 'MFA_FALHOU',
      entidade: 'sessoes_mfa',
      entidade_id: usuario_id,
      dados_depois: { tentativas: novasTentativas },
      ip_address,
    })
  }

  await supabase.from('sessoes_mfa').upsert(
    {
      usuario_id,
      tentativas_falhas: novasTentativas,
      bloqueado_ate,
      ip_address: ip_address ?? null,
    },
    { onConflict: 'usuario_id' }
  )

  const tentativas_restantes = Math.max(0, MAX_TENTATIVAS - novasTentativas)

  if (bloqueado_ate) {
    return {
      sucesso: false,
      bloqueado: true,
      bloqueado_ate,
      tentativas_restantes: 0,
      erro: 'Conta bloqueada temporariamente por excesso de tentativas.',
    }
  }

  return {
    sucesso: false,
    tentativas_restantes,
    erro: `Código inválido. ${tentativas_restantes} tentativa${tentativas_restantes !== 1 ? 's' : ''} restante${tentativas_restantes !== 1 ? 's' : ''}.`,
  }
}

// ---------------------------------------------------------------------------
// 3. Verificar status de lockout
// ---------------------------------------------------------------------------
export async function verificarLockout(usuario_id: string): Promise<LockoutStatus> {
  const { data: sessao } = await supabase
    .from('sessoes_mfa')
    .select('tentativas_falhas, bloqueado_ate')
    .eq('usuario_id', usuario_id)
    .maybeSingle()

  // Usuário nunca teve sessão MFA
  if (!sessao) {
    return { bloqueado: false, tentativas_restantes: 5 }
  }

  const tentativas = (sessao.tentativas_falhas as number | null) ?? 0
  const bloqueadoAteRaw = sessao.bloqueado_ate as string | null

  if (bloqueadoAteRaw) {
    const bloqueadoAte = new Date(bloqueadoAteRaw)

    if (bloqueadoAte > new Date()) {
      // Ainda bloqueado
      return { bloqueado: true, liberado_em: bloqueadoAte }
    }

    // Lockout expirou — resetar
    await supabase.from('sessoes_mfa').upsert(
      {
        usuario_id,
        tentativas_falhas: 0,
        bloqueado_ate: null,
      },
      { onConflict: 'usuario_id' }
    )

    return { bloqueado: false, tentativas_restantes: 5 }
  }

  return {
    bloqueado: false,
    tentativas_restantes: Math.max(0, 5 - tentativas),
  }
}

// ---------------------------------------------------------------------------
// Helper interno — verificação de código de backup (one-time use)
// ---------------------------------------------------------------------------
async function verificarCodigoBackup(usuario_id: string, codigo: string): Promise<boolean> {
  const backupJson = await recuperarDadoSensivel('usuario', usuario_id, 'mfa_backup_codes')
  if (!backupJson) return false

  let codigos: string[]
  try {
    codigos = JSON.parse(backupJson) as string[]
  } catch {
    return false
  }

  const codigoNormalizado = codigo.trim().toUpperCase()
  const idx = codigos.findIndex((c) => c.toUpperCase() === codigoNormalizado)

  if (idx === -1) return false

  // Remover código usado (one-time)
  const codigosAtualizados = [...codigos.slice(0, idx), ...codigos.slice(idx + 1)]
  await salvarDadoSensivel(
    'usuario',
    usuario_id,
    'mfa_backup_codes',
    JSON.stringify(codigosAtualizados)
  )

  return true
}
