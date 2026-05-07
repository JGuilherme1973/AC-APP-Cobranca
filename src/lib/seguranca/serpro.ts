/**
 * SERPRO — Validação de CPF e CNPJ
 *
 * SEGURANÇA: Todas as chamadas passam pela Edge Function proxy-serpro.
 * As chaves SERPRO_CPF_API_KEY e SERPRO_CNPJ_API_KEY nunca são expostas
 * no bundle do frontend. Quando não configuradas no servidor, o proxy
 * executa validação local por algoritmo mod-11.
 */

import { supabase } from '@/lib/supabase'

export interface SerproValidacao {
  valido: boolean
  nome?: string
  situacao_cadastral?: string
  alerta?: string
  bloqueado?: boolean // true quando situacao = CANCELADO, NULO ou SUSPENSO
}

// ---------------------------------------------------------------------------
// 1. Validar CPF
// ---------------------------------------------------------------------------
export async function validarCPF(cpf: string): Promise<SerproValidacao> {
  const cpfLimpo = cpf.replace(/\D/g, '')

  const { data, error } = await supabase.functions.invoke('proxy-serpro', {
    body: { action: 'validar_cpf', cpf: cpfLimpo },
  })

  if (error) {
    // Fallback para validação de formato local se o proxy falhar
    console.error('[SERPRO] Erro no proxy — usando validação local:', error.message)
    const valido = validarCPFFormato(cpfLimpo)
    return {
      valido,
      nome: valido ? 'VALIDAÇÃO LOCAL (fallback)' : undefined,
      situacao_cadastral: valido ? 'REGULAR' : undefined,
      alerta: 'Validação local — proxy-serpro indisponível',
    }
  }

  return data as SerproValidacao
}

// ---------------------------------------------------------------------------
// 2. Validar CNPJ
// ---------------------------------------------------------------------------
export async function validarCNPJ(cnpj: string): Promise<SerproValidacao> {
  const cnpjLimpo = cnpj.replace(/\D/g, '')

  const { data, error } = await supabase.functions.invoke('proxy-serpro', {
    body: { action: 'validar_cnpj', cnpj: cnpjLimpo },
  })

  if (error) {
    // Fallback para validação de formato local se o proxy falhar
    console.error('[SERPRO] Erro no proxy — usando validação local:', error.message)
    const valido = validarCNPJFormato(cnpjLimpo)
    return {
      valido,
      nome: valido ? 'VALIDAÇÃO LOCAL (fallback)' : undefined,
      situacao_cadastral: valido ? 'ATIVA' : undefined,
      alerta: 'Validação local — proxy-serpro indisponível',
    }
  }

  return data as SerproValidacao
}

// ---------------------------------------------------------------------------
// 3. Validação de formato CPF (algoritmo módulo 11)
// Mantida para uso como fallback local quando o proxy não responder.
// ---------------------------------------------------------------------------
export function validarCPFFormato(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '')

  if (digits.length !== 11) return false

  // Rejeitar sequências repetidas (000...0, 111...1, etc.)
  if (/^(\d)\1{10}$/.test(digits)) return false

  // Cálculo do 1º dígito verificador
  let soma = 0
  for (let i = 0; i < 9; i++) {
    soma += parseInt(digits[i]) * (10 - i)
  }
  let resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(digits[9])) return false

  // Cálculo do 2º dígito verificador
  soma = 0
  for (let i = 0; i < 10; i++) {
    soma += parseInt(digits[i]) * (11 - i)
  }
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(digits[10])) return false

  return true
}

// ---------------------------------------------------------------------------
// 4. Validação de formato CNPJ (algoritmo módulo 11)
// Mantida para uso como fallback local quando o proxy não responder.
// ---------------------------------------------------------------------------
export function validarCNPJFormato(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '')

  if (digits.length !== 14) return false

  // Rejeitar sequências repetidas
  if (/^(\d)\1{13}$/.test(digits)) return false

  const calcDigito = (base: string, pesos: number[]): number => {
    let soma = 0
    for (let i = 0; i < pesos.length; i++) {
      soma += parseInt(base[i]) * pesos[i]
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  // Pesos para 1º dígito (12 primeiros dígitos)
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  // Pesos para 2º dígito (13 dígitos: 12 originais + 1º verificador)
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  const d1 = calcDigito(digits, pesos1)
  if (d1 !== parseInt(digits[12])) return false

  const d2 = calcDigito(digits, pesos2)
  if (d2 !== parseInt(digits[13])) return false

  return true
}
