/**
 * alertas-lgpd — Supabase Edge Function (Deno).
 *
 * Verifica solicitações de titulares (LGPD) com prazo crítico
 * e envia alertas por e-mail ao advogado responsável.
 *
 * Deploy: supabase functions deploy alertas-lgpd
 * URL:    https://<project>.supabase.co/functions/v1/alertas-lgpd
 *
 * Chamado automaticamente pelo pg_cron às 11:00 UTC (08:00 Brasília).
 * SEMPRE retorna HTTP 200 — cron-safe.
 *
 * Fluxo:
 *   1. Busca solicitacoes_titular abertas com prazo <= HOJE + 3 dias
 *   2. Envia e-mail de alerta ao advogado responsável de cada caso
 *   3. Atualiza alerta_enviado = TRUE nas processadas
 *   4. Registra ação na auditoria
 *   5. Envia relatório consolidado ao administrador
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Tipos ─────────────────────────────────────────────────────

interface SolicitacaoTitular {
  id:                string
  tipo_solicitacao:  string
  status:            string
  prazo_resposta:    string
  alerta_enviado:    boolean
  devedor_id:        string
  caso_id:           string | null
  devedores: {
    nome: string
    cpf_cnpj: string
  } | null
}

interface Advogado {
  id:    string
  nome:  string
  email: string
}

interface ResultadoProcessamento {
  solicitacao_id: string
  devedor_nome:   string
  tipo:           string
  prazo:          string
  advogado_email: string | null
  status:         'enviado' | 'erro'
  erro?:          string
}

// ── CORS ──────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Handler principal ─────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const supabaseUrl      = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const resendApiKey     = Deno.env.get('RESEND_API_KEY')!
  const adminEmail       = Deno.env.get('ADMIN_EMAIL') ?? 'admin@vindex.com.br'
  const appBaseUrl       = Deno.env.get('APP_BASE_URL') ?? 'https://app.vindex.com.br'

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // ── 1. Calcular data limite (hoje + 3 dias) ─────────────────
  const limite = new Date()
  limite.setDate(limite.getDate() + 3)
  const limiteStr = limite.toISOString().split('T')[0]   // 'YYYY-MM-DD'
  const hoje      = new Date().toISOString().split('T')[0]

  console.log(`[alertas-lgpd] Verificando prazos <= ${limiteStr} (hoje: ${hoje})`)

  // ── 2. Buscar solicitações abertas com prazo crítico ────────
  const { data: solicitacoes, error: erroBusca } = await supabase
    .from('solicitacoes_titular')
    .select(`
      id,
      tipo_solicitacao,
      status,
      prazo_resposta,
      alerta_enviado,
      devedor_id,
      caso_id,
      devedores (
        nome,
        cpf_cnpj
      )
    `)
    .eq('status', 'aberta')
    .eq('alerta_enviado', false)
    .lte('prazo_resposta', limiteStr)
    .order('prazo_resposta', { ascending: true })

  if (erroBusca) {
    console.error('[alertas-lgpd] Erro ao buscar solicitações:', erroBusca)
    return new Response(
      JSON.stringify({ erro: 'Falha ao consultar banco de dados', detalhes: erroBusca.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!solicitacoes || solicitacoes.length === 0) {
    console.log('[alertas-lgpd] Nenhuma solicitação com prazo crítico.')
    return new Response(
      JSON.stringify({ processadas: 0, mensagem: 'Sem alertas pendentes' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`[alertas-lgpd] ${solicitacoes.length} solicitação(ões) com prazo crítico.`)

  const resultados: ResultadoProcessamento[] = []

  // ── 3. Processar cada solicitação individualmente ───────────
  for (const sol of solicitacoes as SolicitacaoTitular[]) {
    const devedor_nome = sol.devedores?.nome ?? 'Devedor desconhecido'
    const resultado: ResultadoProcessamento = {
      solicitacao_id: sol.id,
      devedor_nome,
      tipo:           sol.tipo_solicitacao,
      prazo:          sol.prazo_resposta,
      advogado_email: null,
      status:         'erro',
    }

    try {
      // 3a. Buscar advogado responsável pelo caso
      let advogado: Advogado | null = null

      if (sol.caso_id) {
        const { data: casoData } = await supabase
          .from('casos')
          .select('usuarios (id, nome, email)')
          .eq('id', sol.caso_id)
          .single()

        if (casoData?.usuarios) {
          advogado = casoData.usuarios as unknown as Advogado
        }
      }

      // Fallback: buscar caso pelo devedor_id
      if (!advogado) {
        const { data: casoDevedor } = await supabase
          .from('casos')
          .select('usuarios (id, nome, email), titulos (devedor_id)')
          .eq('status', 'ATIVO')
          .eq('titulos.devedor_id', sol.devedor_id)
          .limit(1)
          .maybeSingle()

        if (casoDevedor?.usuarios) {
          advogado = casoDevedor.usuarios as unknown as Advogado
        }
      }

      resultado.advogado_email = advogado?.email ?? null

      // 3b. Enviar e-mail de alerta via Resend
      const diasRestantes = Math.ceil(
        (new Date(sol.prazo_resposta).getTime() - new Date(hoje).getTime()) / (1000 * 60 * 60 * 24)
      )
      const urgencia = diasRestantes <= 0
        ? 'PRAZO VENCIDO'
        : diasRestantes === 1
          ? 'ÚLTIMO DIA'
          : `${diasRestantes} DIAS RESTANTES`

      const casoLink = sol.caso_id
        ? `${appBaseUrl}/casos/${sol.caso_id}`
        : `${appBaseUrl}/devedores/${sol.devedor_id}`

      const emailDestino = advogado?.email ?? adminEmail
      const emailNome    = advogado?.nome  ?? 'Equipe VINDEX'

      const emailBody = {
        from:    'VINDEX Alertas <alertas@vindex.com.br>',
        to:      [emailDestino],
        subject: `[LGPD — PRAZO CRÍTICO] ${sol.tipo_solicitacao} de ${devedor_nome}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #d32f2f; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0;">⚠️ LGPD — Prazo Crítico</h2>
              <p style="margin: 8px 0 0; font-size: 18px; font-weight: bold;">${urgencia}</p>
            </div>

            <div style="background: #fff3f3; border: 2px solid #d32f2f; padding: 20px; border-radius: 0 0 8px 8px;">
              <p>Olá, <strong>${emailNome}</strong>.</p>

              <p>Uma solicitação de titular sob a <strong>LGPD</strong> requer atenção imediata:</p>

              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr style="background: #f5f5f5;">
                  <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #ddd;">Tipo de Solicitação</td>
                  <td style="padding: 8px 12px; border: 1px solid #ddd;">${sol.tipo_solicitacao}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #ddd;">Titular / Devedor</td>
                  <td style="padding: 8px 12px; border: 1px solid #ddd;">${devedor_nome}</td>
                </tr>
                <tr style="background: #f5f5f5;">
                  <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #ddd;">CPF / CNPJ</td>
                  <td style="padding: 8px 12px; border: 1px solid #ddd;">${sol.devedores?.cpf_cnpj ?? 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #ddd; color: #d32f2f;">Prazo de Resposta</td>
                  <td style="padding: 8px 12px; border: 1px solid #ddd; color: #d32f2f; font-weight: bold;">
                    ${new Date(sol.prazo_resposta).toLocaleDateString('pt-BR')} (${urgencia})
                  </td>
                </tr>
              </table>

              <p style="background: #fff8e1; border-left: 4px solid #f9a825; padding: 12px; margin: 16px 0;">
                <strong>Atenção:</strong> A LGPD (Lei 13.709/2018) exige resposta em até 15 dias.
                O não cumprimento pode gerar sanções administrativas pela ANPD.
              </p>

              <div style="text-align: center; margin: 24px 0;">
                <a href="${casoLink}"
                   style="background: #1976d2; color: white; padding: 12px 32px;
                          text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
                  Acessar Caso
                </a>
              </div>

              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
              <p style="color: #757575; font-size: 12px;">
                VINDEX Sistema de Cobrança — Alerta automático gerado em
                ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília)
              </p>
            </div>
          </div>
        `,
      }

      const resendResp = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(emailBody),
      })

      if (!resendResp.ok) {
        const erroResend = await resendResp.text()
        throw new Error(`Resend ${resendResp.status}: ${erroResend}`)
      }

      // 3c. Marcar alerta como enviado
      const { error: erroUpdate } = await supabase
        .from('solicitacoes_titular')
        .update({ alerta_enviado: true })
        .eq('id', sol.id)

      if (erroUpdate) {
        console.warn(`[alertas-lgpd] Erro ao atualizar alerta_enviado para ${sol.id}:`, erroUpdate)
      }

      // 3d. Registrar na auditoria
      await supabase.from('auditoria').insert({
        acao:           'LGPD_ALERTA_ENVIADO',
        entidade:       'solicitacoes_titular',
        entidade_id:    sol.id,
        detalhes: {
          tipo_solicitacao: sol.tipo_solicitacao,
          devedor_nome,
          prazo_resposta:   sol.prazo_resposta,
          dias_restantes:   diasRestantes,
          advogado_email:   emailDestino,
        },
      })

      resultado.status = 'enviado'
      console.log(`[alertas-lgpd] Alerta enviado para ${sol.id} (${devedor_nome}) → ${emailDestino}`)

    } catch (err) {
      resultado.status = 'erro'
      resultado.erro   = err instanceof Error ? err.message : String(err)
      console.error(`[alertas-lgpd] Erro ao processar ${sol.id}:`, resultado.erro)
    }

    resultados.push(resultado)
  }

  // ── 4. Enviar relatório consolidado ao admin ─────────────────
  const enviados = resultados.filter(r => r.status === 'enviado')
  const erros    = resultados.filter(r => r.status === 'erro')

  if (resultados.length > 0) {
    try {
      const linhasTabela = resultados
        .map(r => `
          <tr style="background: ${r.status === 'enviado' ? '#f1f8e9' : '#ffebee'}">
            <td style="padding: 8px; border: 1px solid #ddd;">${r.devedor_nome}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${r.tipo}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${new Date(r.prazo).toLocaleDateString('pt-BR')}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${r.advogado_email ?? '—'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; color: ${r.status === 'enviado' ? '#2e7d32' : '#c62828'}">
              ${r.status === 'enviado' ? 'Enviado' : 'Erro: ' + r.erro}
            </td>
          </tr>
        `)
        .join('')

      await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    'VINDEX Sistema <noreply@vindex.com.br>',
          to:      [adminEmail],
          subject: `[VINDEX] Relatório LGPD — ${enviados.length} alerta(s) enviado(s) | ${new Date().toLocaleDateString('pt-BR')}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
              <h2 style="color: #1565c0;">Relatório Diário — Alertas LGPD</h2>
              <p>Data: <strong>${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</strong> (Brasília)</p>

              <div style="display: flex; gap: 16px; margin: 16px 0;">
                <div style="background: #e8f5e9; padding: 16px; border-radius: 8px; flex: 1; text-align: center;">
                  <div style="font-size: 28px; font-weight: bold; color: #2e7d32;">${enviados.length}</div>
                  <div style="color: #2e7d32;">Alertas Enviados</div>
                </div>
                <div style="background: ${erros.length > 0 ? '#ffebee' : '#f5f5f5'}; padding: 16px; border-radius: 8px; flex: 1; text-align: center;">
                  <div style="font-size: 28px; font-weight: bold; color: ${erros.length > 0 ? '#c62828' : '#757575'};">${erros.length}</div>
                  <div style="color: ${erros.length > 0 ? '#c62828' : '#757575'};">Erros</div>
                </div>
              </div>

              <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                <thead>
                  <tr style="background: #1565c0; color: white;">
                    <th style="padding: 10px; text-align: left;">Titular</th>
                    <th style="padding: 10px; text-align: left;">Tipo</th>
                    <th style="padding: 10px; text-align: left;">Prazo</th>
                    <th style="padding: 10px; text-align: left;">Advogado</th>
                    <th style="padding: 10px; text-align: left;">Status</th>
                  </tr>
                </thead>
                <tbody>${linhasTabela}</tbody>
              </table>

              <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;">
              <p style="color: #9e9e9e; font-size: 12px;">
                Relatório automático gerado por VINDEX · alertas-lgpd Edge Function
              </p>
            </div>
          `,
        }),
      })
    } catch (err) {
      console.error('[alertas-lgpd] Erro ao enviar relatório ao admin:', err)
    }
  }

  // ── 5. Resposta final ────────────────────────────────────────
  const resposta = {
    processadas: resultados.length,
    enviadas:    enviados.length,
    erros:       erros.map(e => ({ id: e.solicitacao_id, devedor: e.devedor_nome, erro: e.erro })),
    executado_em: new Date().toISOString(),
  }

  console.log('[alertas-lgpd] Concluído:', resposta)

  return new Response(
    JSON.stringify(resposta),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
