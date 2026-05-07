import { differenceInDays, addYears, parseISO } from 'date-fns'
import type { StatusPrescricao, TipoTitulo } from '@/types/cobranca'

// Art. 206, §5º, I — títulos formalizados = 5 anos
// Art. 205 — regra geral (mútuo informal, verbal) = 10 anos
const TITULOS_5_ANOS: TipoTitulo[] = [
  'NOTA_PROMISSORIA',
  'CHEQUE',
  'DUPLICATA',
  'CONTRATO_ASSINADO',
  'CONFISSAO_DIVIDA',
  'SENTENCA_JUDICIAL',
]

export function calcularPrazoPrescricial(tipoTitulo: TipoTitulo): 5 | 10 {
  return TITULOS_5_ANOS.includes(tipoTitulo) ? 5 : 10
}

export function calcularDataLimiteAjuizamento(
  dataInicioRef: string,
  prazoAnos: 5 | 10,
  interrupcaoData?: string,
): Date {
  const base = interrupcaoData
    ? parseISO(interrupcaoData)
    : parseISO(dataInicioRef)
  return addYears(base, prazoAnos)
}

export function calcularStatusPrescricao(dataLimite: Date): StatusPrescricao {
  const hoje = new Date()
  const dias = differenceInDays(dataLimite, hoje)

  if (dias < 0) return 'VERMELHO'
  if (dias <= 180) return 'AMARELO'
  return 'VERDE'
}

export function calcularDiasRestantes(dataLimite: Date): number {
  return differenceInDays(dataLimite, new Date())
}

export function deveAlertar(dataLimite: Date): { alertar: boolean; nivel: 30 | 90 | 180 | null } {
  const dias = calcularDiasRestantes(dataLimite)

  if (dias <= 30)  return { alertar: true, nivel: 30 }
  if (dias <= 90)  return { alertar: true, nivel: 90 }
  if (dias <= 180) return { alertar: true, nivel: 180 }

  return { alertar: false, nivel: null }
}
