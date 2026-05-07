/**
 * SERPRO — Validação de CPF e CNPJ
 *
 * Quando as chaves de API não estão configuradas, cai em validação local
 * usando os algoritmos de dígito verificador (mod 11) sem chamada externa.
 */

export interface SerproValidacao {
  valido: boolean
  nome?: string
  situacao_cadastral?: string
  alerta?: string
  bloqueado?: boolean // true quando situacao = CANCELADO, NULO ou SUSPENSO
}

const SITUACOES_BLOQUEADORAS = ['CANCELADO', 'NULO', 'SUSPENSO']
const SITUACOES_ALERTA = ['PENDENTE_REGULARIZACAO', 'IRREGULAR']

// ---------------------------------------------------------------------------
// 1. Validar CPF
// ---------------------------------------------------------------------------
export async function validarCPF(cpf: string): Promise<SerproValidacao> {
  const cpfLimpo = cpf.replace(/\D/g, '')

  const apiKey = import.meta.env.VITE_SERPRO_CPF_API_KEY as string | undefined
  const apiUrl = import.meta.env.VITE_SERPRO_API_URL as string | undefined

  // STUB: sem chave configurada — validação apenas por formato
  if (!apiKey) {
    console.warn('[STUB] SERPRO não configurado — validação apenas por formato')
    const valido = validarCPFFormato(cpfLimpo)
    return {
      valido,
      nome: valido ? 'VALIDAÇÃO LOCAL' : undefined,
      situacao_cadastral: valido ? 'REGULAR' : undefined,
    }
  }

  // REAL: consulta SERPRO
  try {
    const response = await fetch(
      `${apiUrl}/consulta-cpf/v0/cpf/${cpfLimpo}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        return { valido: false, situacao_cadastral: 'NAO_ENCONTRADO' }
      }
      throw new Error(`SERPRO CPF retornou status ${response.status}`)
    }

    const data = (await response.json()) as {
      ni?: string
      nome?: string
      situacao?: { codigo?: string; descricao?: string }
    }

    const situacao = data.situacao?.descricao?.toUpperCase() ?? 'DESCONHECIDA'
    const bloqueado = SITUACOES_BLOQUEADORAS.includes(situacao)
    const alerta = SITUACOES_ALERTA.includes(situacao) ? `CPF em situação: ${situacao}` : undefined

    return {
      valido: !bloqueado,
      nome: data.nome,
      situacao_cadastral: situacao,
      alerta,
      bloqueado,
    }
  } catch (err) {
    // Fallback para validação local em caso de erro de rede
    console.error('[SERPRO] Erro na consulta de CPF — usando validação local:', err)
    const valido = validarCPFFormato(cpfLimpo)
    return {
      valido,
      nome: valido ? 'VALIDAÇÃO LOCAL (fallback)' : undefined,
      situacao_cadastral: valido ? 'REGULAR' : undefined,
      alerta: 'Validação local — SERPRO indisponível',
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Validar CNPJ
// ---------------------------------------------------------------------------
export async function validarCNPJ(cnpj: string): Promise<SerproValidacao> {
  const cnpjLimpo = cnpj.replace(/\D/g, '')

  const apiKey = import.meta.env.VITE_SERPRO_CNPJ_API_KEY as string | undefined
  const apiUrl = import.meta.env.VITE_SERPRO_API_URL as string | undefined

  // STUB: sem chave configurada — validação apenas por formato
  if (!apiKey) {
    console.warn('[STUB] SERPRO não configurado — validação apenas por formato')
    const valido = validarCNPJFormato(cnpjLimpo)
    return {
      valido,
      nome: valido ? 'VALIDAÇÃO LOCAL' : undefined,
      situacao_cadastral: valido ? 'ATIVA' : undefined,
    }
  }

  // REAL: consulta SERPRO
  try {
    const response = await fetch(
      `${apiUrl}/consulta-cnpj/v0/cnpj/${cnpjLimpo}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        return { valido: false, situacao_cadastral: 'NAO_ENCONTRADO' }
      }
      throw new Error(`SERPRO CNPJ retornou status ${response.status}`)
    }

    const data = (await response.json()) as {
      ni?: string
      nomeEmpresarial?: string
      situacaoCadastral?: { codigo?: string; descricao?: string }
    }

    const situacao = data.situacaoCadastral?.descricao?.toUpperCase() ?? 'DESCONHECIDA'
    const bloqueado = SITUACOES_BLOQUEADORAS.includes(situacao)
    const alerta = SITUACOES_ALERTA.includes(situacao)
      ? `CNPJ em situação: ${situacao}`
      : undefined

    return {
      valido: !bloqueado,
      nome: data.nomeEmpresarial,
      situacao_cadastral: situacao,
      alerta,
      bloqueado,
    }
  } catch (err) {
    console.error('[SERPRO] Erro na consulta de CNPJ — usando validação local:', err)
    const valido = validarCNPJFormato(cnpjLimpo)
    return {
      valido,
      nome: valido ? 'VALIDAÇÃO LOCAL (fallback)' : undefined,
      situacao_cadastral: valido ? 'ATIVA' : undefined,
      alerta: 'Validação local — SERPRO indisponível',
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Validação de formato CPF (algoritmo módulo 11)
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
