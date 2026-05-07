/**
 * proxy-openai — Thin JWT-validating wrapper around ia-regua.
 *
 * Impede que o frontend chame ia-regua diretamente sem autenticação.
 * Valida JWT + role, depois encaminha a requisição para ia-regua
 * usando service_role (server-to-server).
 *
 * Actions: personalizar | classificar | sugerir
 * (mapeados para: personalizar_mensagem | classificar_intencao | sugerir_proxima_acao)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Mapeamento de actions simplificadas para as actions reais do ia-regua
const ACTION_MAP: Record<string, string> = {
  personalizar: 'personalizar_mensagem',
  classificar: 'classificar_intencao',
  sugerir: 'sugerir_proxima_acao',
  // Aceitar também as formas completas diretamente
  personalizar_mensagem: 'personalizar_mensagem',
  classificar_intencao: 'classificar_intencao',
  sugerir_proxima_acao: 'sugerir_proxima_acao',
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
        JSON.stringify({ sucesso: false, erro: 'Permissão insuficiente para usar IA' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Parse body ──────────────────────────────────────────────
    const body = await req.json() as { action: string; [key: string]: unknown }
    const { action, ...params } = body

    if (!action) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: 'Campo "action" obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const iaAction = ACTION_MAP[action]
    if (!iaAction) {
      return new Response(
        JSON.stringify({ sucesso: false, erro: `Action desconhecida: ${action}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Forward to ia-regua via service_role (server-to-server) ─
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const iaResponse = await fetch(`${supabaseUrl}/functions/v1/ia-regua`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
        'x-client-info': 'proxy-openai',
      },
      body: JSON.stringify({ action: iaAction, ...params }),
    })

    const resultado = await iaResponse.json()

    return new Response(
      JSON.stringify(resultado),
      {
        status: iaResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('[proxy-openai]', err)
    return new Response(
      JSON.stringify({ sucesso: false, erro: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
