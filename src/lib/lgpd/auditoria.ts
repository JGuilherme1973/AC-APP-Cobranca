/**
 * LGPD — Serviço de Auditoria
 * Wrapper para a tabela `auditoria`. Erros são logados mas nunca relançados
 * para não interromper o fluxo principal da aplicação.
 */

import { supabase } from '@/lib/supabase'

export interface RegistroAuditoria {
  usuario_id?: string
  acao: string
  entidade: string
  entidade_id?: string
  dados_antes?: object
  dados_depois?: object
  ip_address?: string
}

async function registrarAuditoria(params: RegistroAuditoria): Promise<void> {
  try {
    const { error } = await supabase.from('auditoria').insert({
      usuario_id: params.usuario_id ?? null,
      acao: params.acao,
      entidade: params.entidade,
      entidade_id: params.entidade_id ?? null,
      dados_antes: params.dados_antes ?? null,
      dados_depois: params.dados_depois ?? null,
      ip_address: params.ip_address ?? null,
      criado_em: new Date().toISOString(),
    })

    if (error) {
      console.error('[Auditoria] Erro ao registrar:', error.message)
    }
  } catch (err) {
    console.error('[Auditoria] Exceção ao registrar:', err)
  }
}

async function buscarAuditoria(filtros: {
  entidade?: string
  entidade_id?: string
  acao?: string
  limite?: number
}): Promise<RegistroAuditoria[]> {
  let query = supabase
    .from('auditoria')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filtros.limite ?? 100)

  if (filtros.entidade) {
    query = query.eq('entidade', filtros.entidade)
  }
  if (filtros.entidade_id) {
    query = query.eq('entidade_id', filtros.entidade_id)
  }
  if (filtros.acao) {
    query = query.eq('acao', filtros.acao)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao buscar auditoria: ${error.message}`)
  }

  return (data ?? []) as RegistroAuditoria[]
}

export const auditoriaService = {
  registrar: registrarAuditoria,
  buscar: buscarAuditoria,
}

export { registrarAuditoria, buscarAuditoria }
