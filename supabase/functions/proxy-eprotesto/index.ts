/**
 * proxy-eprotesto — Proxy seguro para e-Protesto API.
 *
 * Mantém a EPROTESTO_API_KEY no servidor (Supabase Secrets).
 * Protesto é ato jurídico — requer role ADMIN ou ADVOGADO.
 *
 * Actions: enviar_titulo | cancelar_titulo | status_titulo
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

    // ── Role check — protesto é ato jurídico: ADMIN ou ADVOGADO apenas ──
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('id, role')
      .eq('auth_id', user.id)
      .single()

    const rolesPermitidos = ['ADMIN', 'ADVOGADO']
    if (!usuario || !rolesPermitidos.includes(usuario.role)) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: 'Apenas ADMIN ou ADVOGADO podem operar protestos' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Parse body ──────────────────────────────────────────────
    const { action, ...params } = await req.json() as {
      action: 'enviar_titulo' | 'cancelar_titulo' | 'status_titulo'
      [key: string]: unknown
    }

    if (!action) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: 'Campo "action" obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── API credentials ─────────────────────────────────────────
    const apiKey = Deno.env.get('EPROTESTO_API_KEY')
    const apiUrl = Deno.env.get('EPROTESTO_API_URL')

    let resultado: Record<string, unknown>

    if (!apiKey || !apiUrl) {
      // ── STUB mode ────────────────────────────────────────────
      console.warn('[STUB] e-Protesto não configurado — retornando resposta simulada para action:', action)

      if (action === 'enviar_titulo') {
        const id_gateway = `PROTO-STUB-${Date.now()}`
        resultado = {
          sucesso: true,
          id_gateway,
          numero_protocolo: `STUB-PROT-${Date.now()}`,
        }
      } else if (action === 'cancelar_titulo') {
        resultado = { sucesso: true }
      } else if (action === 'status_titulo') {
        resultado = { sucesso: true, status: 'enviado', data_atualizacao: new Date().toISOString() }
      } else {
        resultado = { sucesso: false, erro: `Action desconhecida: ${action}` }
      }
    } else {
      // ── REAL API ─────────────────────────────────────────────
      let apiResponse: Response

      if (action === 'enviar_titulo') {
        apiResponse = await fetch(`${apiUrl}/titulos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(params),
        })
      } else if (action === 'cancelar_titulo') {
        const { id_gateway, ...rest } = params as { id_gateway?: string; [key: string]: unknown }
        apiResponse = await fetch(`${apiUrl}/titulos/${id_gateway ?? ''}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(rest),
        })
      } else if (action === 'status_titulo') {
        const { id_gateway } = params as { id_gateway?: string }
        apiResponse = await fetch(`${apiUrl}/titulos/${id_gateway ?? ''}`, {
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
          JSON.stringify({ sucesso: false, erro: `e-Protesto API error: ${errBody}` }),
          { status: apiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      resultado = await apiResponse.json() as Record<string, unknown>
    }

    // ── Audit log ───────────────────────────────────────────────
    await supabase.from('auditoria').insert({
      usuario_id: usuario.id,
      acao: `EPROTESTO_${action.toUpperCase()}`,
      entidade: 'protestos',
      entidade_id: (params as { protesto_id?: string }).protesto_id ?? null,
      dados_antes: null,
      dados_depois: resultado,
      ip_address: null,
    }).catch(e => console.warn('[proxy-eprotesto] Erro ao registrar auditoria:', e))

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[proxy-eprotesto]', err)
    return new Response(
      JSON.stringify({ sucesso: false, erro: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
