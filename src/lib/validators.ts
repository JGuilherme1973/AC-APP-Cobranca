// ── CPF ────────────────────────────────────────────────────
export function validarCPF(cpf: string): boolean {
  const n = cpf.replace(/\D/g, '')
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += parseInt(n[i]) * (10 - i)
  let r = (s * 10) % 11
  if (r === 10 || r === 11) r = 0
  if (r !== parseInt(n[9])) return false
  s = 0
  for (let i = 0; i < 10; i++) s += parseInt(n[i]) * (11 - i)
  r = (s * 10) % 11
  if (r === 10 || r === 11) r = 0
  return r === parseInt(n[10])
}

// ── CNPJ ───────────────────────────────────────────────────
export function validarCNPJ(cnpj: string): boolean {
  const n = cnpj.replace(/\D/g, '')
  if (n.length !== 14 || /^(\d)\1{13}$/.test(n)) return false
  const calc = (digits: string, weights: number[]) => {
    const s = weights.reduce((acc, w, i) => acc + parseInt(digits[i]) * w, 0)
    const remainder = s % 11
    return remainder < 2 ? 0 : 11 - remainder
  }
  return (
    calc(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === parseInt(n[12]) &&
    calc(n, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === parseInt(n[13])
  )
}

// ── Máscaras ────────────────────────────────────────────────
export function mascaraCPF(v: string): string {
  return v
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function mascaraCNPJ(v: string): string {
  return v
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function mascaraCEP(v: string): string {
  return v
    .replace(/\D/g, '')
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, '$1-$2')
}

export function mascaraTelefone(v: string): string {
  const n = v.replace(/\D/g, '').slice(0, 11)
  if (n.length === 11) return n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (n.length >= 10)  return n.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
  return n
}

// Aplica CPF ou CNPJ baseado no comprimento atual
export function mascaraCPFouCNPJ(v: string, tipo: 'PF' | 'PJ' | string): string {
  return tipo === 'PJ' ? mascaraCNPJ(v) : mascaraCPF(v)
}
