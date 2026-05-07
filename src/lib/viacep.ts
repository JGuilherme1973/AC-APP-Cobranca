export interface EnderecoViaCEP {
  logradouro: string
  complemento: string
  bairro: string
  localidade: string
  uf: string
}

export async function buscarCEP(cep: string): Promise<EnderecoViaCEP | null> {
  const numeros = cep.replace(/\D/g, '')
  if (numeros.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${numeros}/json/`)
    if (!res.ok) return null
    const data = await res.json() as ({ erro: true } | (EnderecoViaCEP & { erro?: false }))
    return data.erro ? null : data as EnderecoViaCEP
  } catch {
    return null
  }
}
