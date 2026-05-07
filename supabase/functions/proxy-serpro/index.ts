/**
 * proxy-serpro — Proxy seguro para SERPRO CPF/CNPJ validation.
 *
 * Mantém SERPRO_CPF_API_KEY e SERPRO_CNPJ_API_KEY no servidor (Supabase Secrets).
 * Todos os roles podem usar (necessário no cadastro).
 *
 * Actions: validar_cpf | validar_cnpj
 *
 * Em modo STUB (sem chave configurada), executa algoritmo mod-11 localmente.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Algoritmo mod-11 CPF ────────────────────────────────────────────────────
function validarCPFLocal(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i)
  let r = (s * 10) % 11; if (r >= 10) r = 0
  if (r !== +d[9]) return false
  s = 0
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i)
  r = (s * 10) % 11; if (r >= 10) r = 0
  return r === +d[10]
}

// ── Algoritmo mod-11 CNPJ ───────────────────────────────────────────────────
function validarCNPJLocal(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false

  const calcDigito = (base: string, pesos: number[]): number => {
    let soma = 0
    for (let i = 0; i < pesos.length; i++) soma += +base[i] * pesos[i]
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  const d1 = calcDigito(d, pesos1)
  if (d1 !== +d[12]) return false

  const d2 = calcDigito(d, pesos2)
  return d2 === +d[13]
}

const SITUACOES_BLOQUEADORAS = ['CANCELADO', 'NULO', 'SUSPENSO']
const SITUACOES_ALERTA = ['PENDENTE_REGULARIZACAO', 'IRREGULAR']

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── JWT validation ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ valido: false, erro: 'Token de autenticação ausente' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ valido: false, erro: 'Token inválido ou expirado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Role check — todos os roles autenticados podem validar CPF/CNPJ ──
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('id, role')
      .eq('auth_id', user.id)
      .single()

    const rolesPermitidos = ['ADMIN', 'ADVOGADO', 'ASSISTENTE', 'VIEWER']
    if (!usuario || !rolesPermitidos.includes(usuario.role)) {
      return new Response(
        JSON.stringify({ valido: false, erro: 'Usuário não autorizado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Parse body ──────────────────────────────────────────────
    const { action, cpf, cnpj } = await req.json() as {
      action: 'validar_cpf' | 'validar_cnpj'
      cpf?: string
      cnpj?: string
    }

    if (!action) {
      return new Response(
        JSON.stringify({ valido: false, erro: 'Campo "action" obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const apiUrl = Deno.env.get('SERPRO_API_URL')

    // ─── ACTION: validar_cpf ────────────────────────────────────
    if (action === 'validar_cpf') {
      const cpfLimpo = (cpf ?? '').replace(/\D/g, '')
      const apiKey = Deno.env.get('SERPRO_CPF_API_KEY')

      if (!apiKey || !apiUrl) {
        console.warn('[STUB] SERPRO CPF não configurado — validação apenas por formato')
        const valido = validarCPFLocal(cpfLimpo)
        return new Response(
          JSON.stringify({
            valido,
            nome: valido ? 'VALIDAÇÃO LOCAL' : undefined,
            situacao_cadastral: valido ? 'REGULAR' : undefined,
            alerta: 'Validação local — SERPRO não configurado',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      try {
        const response = await fetch(`${apiUrl}/consulta-cpf/v0/cpf/${cpfLimpo}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
        })

        if (!response.ok) {
          if (response.status === 404) {
            return new Response(
              JSON.stringify({ valido: false, situacao_cadastral: 'NAO_ENCONTRADO' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            )
          }
          throw new Error(`SERPRO CPF retornou status ${response.status}`)
        }

        const data = await response.json() as {
          ni?: string
          nome?: string
          situacao?: { codigo?: string; descricao?: string }
        }

        const situacao = data.situacao?.descricao?.toUpperCase() ?? 'DESCONHECIDA'
        const bloqueado = SITUACOES_BLOQUEADORAS.includes(situacao)
        const alerta = SITUACOES_ALERTA.includes(situacao) ? `CPF em situação: ${situacao}` : undefined

        return new Response(
          JSON.stringify({
            valido: !bloqueado,
            nome: data.nome,
            situacao_cadastral: situacao,
            alerta,
            bloqueado,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      } catch (err) {
        console.error('[SERPRO] Erro na consulta de CPF — usando validação local:', err)
        const valido = validarCPFLocal(cpfLimpo)
        return new Response(
          JSON.stringify({
            valido,
            nome: valido ? 'VALIDAÇÃO LOCAL (fallback)' : undefined,
            situacao_cadastral: valido ? 'REGULAR' : undefined,
            alerta: 'Validação local — SERPRO indisponível',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // ─── ACTION: validar_cnpj ───────────────────────────────────
    if (action === 'validar_cnpj') {
      const cnpjLimpo = (cnpj ?? '').replace(/\D/g, '')
      const apiKey = Deno.env.get('SERPRO_CNPJ_API_KEY')

      if (!apiKey || !apiUrl) {
        console.warn('[STUB] SERPRO CNPJ não configurado — validação apenas por formato')
        const valido = validarCNPJLocal(cnpjLimpo)
        return new Response(
          JSON.stringify({
            valido,
            nome: valido ? 'VALIDAÇÃO LOCAL' : undefined,
            situacao_cadastral: valido ? 'ATIVA' : undefined,
            alerta: 'Validação local — SERPRO não configurado',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      try {
        const response = await fetch(`${apiUrl}/consulta-cnpj/v0/cnpj/${cnpjLimpo}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
        })

        if (!response.ok) {
          if (response.status === 404) {
            return new Response(
              JSON.stringify({ valido: false, situacao_cadastral: 'NAO_ENCONTRADO' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            )
          }
          throw new Error(`SERPRO CNPJ retornou status ${response.status}`)
        }

        const data = await response.json() as {
          ni?: string
          nomeEmpresarial?: string
          situacaoCadastral?: { codigo?: string; descricao?: string }
        }

        const situacao = data.situacaoCadastral?.descricao?.toUpperCase() ?? 'DESCONHECIDA'
        const bloqueado = SITUACOES_BLOQUEADORAS.includes(situacao)
        const alerta = SITUACOES_ALERTA.includes(situacao) ? `CNPJ em situação: ${situacao}` : undefined

        return new Response(
          JSON.stringify({
            valido: !bloqueado,
            nome: data.nomeEmpresarial,
            situacao_cadastral: situacao,
            alerta,
            bloqueado,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      } catch (err) {
        console.error('[SERPRO] Erro na consulta de CNPJ — usando validação local:', err)
        const valido = validarCNPJLocal(cnpjLimpo)
        return new Response(
          JSON.stringify({
            valido,
            nome: valido ? 'VALIDAÇÃO LOCAL (fallback)' : undefined,
            situacao_cadastral: valido ? 'ATIVA' : undefined,
            alerta: 'Validação local — SERPRO indisponível',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    return new Response(
      JSON.stringify({ valido: false, erro: `Action desconhecida: ${String(action)}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[proxy-serpro]', err)
    return new Response(
      JSON.stringify({ valido: false, erro: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
