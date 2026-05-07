import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}

export function formatarCPFCNPJ(valor: string): string {
  const numeros = valor.replace(/\D/g, '')
  if (numeros.length <= 11) {
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export function formatarTelefone(valor: string): string {
  const numeros = valor.replace(/\D/g, '')
  if (numeros.length === 11) {
    return numeros.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  }
  return numeros.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
}

export function formatarCEP(valor: string): string {
  return valor.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2')
}

export function formatarData(data: string): string {
  return new Date(data).toLocaleDateString('pt-BR')
}

export function formatarDataHora(data: string): string {
  return new Date(data).toLocaleString('pt-BR')
}
