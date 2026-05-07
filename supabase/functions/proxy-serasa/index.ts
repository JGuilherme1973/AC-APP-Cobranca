/**
 * proxy-serasa — Proxy seguro para Serasa Experian API.
 *
 * Mantém a SERASA_API_KEY no servidor (Supabase Secrets).
 * O frontend nunca tem acesso à chave.
 *
 * Actions: negativar | baixar | consultar
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── JWT validation ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: 'Token de autenticação ausente' }),
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
        JSON.stringify({ sucesso: false, erro: 'Token inválido ou expirado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Role check ──────────────────────────────────────────────
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('id, role')
      .eq('auth_id', user.id)
      .single()

    const rolesPermitidos = ['ADMIN', 'ADVOGADO', 'ASSISTENTE']
    if (!usuario || !rolesPermitidos.includes(usuario.role)) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: 'Permissão insuficiente para operações Serasa' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Parse body ──────────────────────────────────────────────
    const { action, ...params } = await req.json() as {
      action: 'negativar' | 'baixar' | 'consultar'
      [key: string]: unknown
    }

    if (!action) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: 'Campo "action" obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── API credentials ─────────────────────────────────────────
    const apiKey = Deno.env.get('SERASA_API_KEY')
    const apiUrl = Deno.env.get('SERASA_API_URL')

    let resultado: Record<string, unknown>

    if (!apiKey || !apiUrl) {
      // ── STUB mode ────────────────────────────────────────────
      console.warn('[STUB] Serasa não configurado — retornando resposta simulada para action:', action)

      if (action === 'negativar') {
        resultado = { sucesso: true, id_bureau: `SERASA-STUB-${Date.now()}` }
      } else if (action === 'baixar') {
        resultado = { sucesso: true }
      } else if (action === 'consultar') {
        resultado = { sucesso: true, restricoes: [] }
      } else {
        resultado = { sucesso: false, erro: `Action desconhecida: ${action}` }
      }
    } else {
      // ── REAL API ─────────────────────────────────────────────
      let apiResponse: Response

      if (action === 'negativar') {
        apiResponse = await fetch(`${apiUrl}/negativacoes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(params),
        })
      } else if (action === 'baixar') {
        const { id_bureau, ...rest } = params as { id_bureau?: string; [key: string]: unknown }
        apiResponse = await fetch(`${apiUrl}/negativacoes/${id_bureau ?? ''}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(rest),
        })
      } else if (action === 'consultar') {
        const { cpf_cnpj } = params as { cpf_cnpj?: string }
        apiResponse = await fetch(`${apiUrl}/consultas/${encodeURIComponent(cpf_cnpj ?? '')}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
      } else {
        return new Response(
          JSON.stringify({ sucesso: false, erro: `Action desconhecida: ${String(action)}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (!apiResponse.ok) {
        const errBody = await apiResponse.text().catch(() => apiResponse.statusText)
        return new Response(
          JSON.stringify({ sucesso: false, erro: `Serasa API error: ${errBody}` }),
          { status: apiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      resultado = await apiResponse.json() as Record<string, unknown>
    }

    // ── Audit log ───────────────────────────────────────────────
    await supabase.from('auditoria').insert({
      usuario_id: usuario.id,
      acao: `SERASA_${action.toUpperCase()}`,
      entidade: 'negativacoes',
      entidade_id: (params as { negativacao_id?: string }).negativacao_id ?? null,
      dados_antes: null,
      dados_depois: resultado,
      ip_address: null,
    }).catch(e => console.warn('[proxy-serasa] Erro ao registrar auditoria:', e))

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[proxy-serasa]', err)
    return new Response(
      JSON.stringify({ sucesso: false, erro: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
