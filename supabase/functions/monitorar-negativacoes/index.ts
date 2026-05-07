// Job: executar diariamente às 06h00
// 1. Busca negativacoes status = 'pendente_notificacao' WHERE data_notificacao_previa + 10 <= TODAY
// 2. Para cada uma: verifica pagamentos recentes
// 3. Se não houve pagamento: chama Serasa API (ou stub)
// 4. Envia relatório por email ao admin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Negativacao {
  id: string
  caso_id: string
  devedor_id: string
  bureau: string
  valor: number
  status: string
  data_notificacao_previa: string | null
  canal_notificacao_previa: string | null
  data_negativacao: string | null
  data_baixa: string | null
  motivo_baixa: string | null
}

interface Pagamento {
  id: string
  caso_id: string
  valor: number
  data_pagamento: string
  created_at: string
}

interface Caso {
  id: string
  status: string
}

interface Relatorio {
  negativacoes_verificadas: number
  executadas: number
  canceladas_por_pagamento: number
  erros: string[]
}

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function buildHtmlRelatorio(relatorio: Relatorio, today: string): string {
  const errosHtml =
    relatorio.erros.length > 0
      ? `<ul style="color:#dc2626;">${relatorio.erros.map((e) => `<li>${e}</li>`).join('')}</ul>`
      : '<p style="color:#16a34a;">Nenhum erro registrado.</p>'

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Relatório Negativações — ${today}</title>
</head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:32px;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#0E1B2A;padding:24px 32px;">
      <h1 style="color:#B79A5A;margin:0;font-size:20px;">VINDEX Cobranças</h1>
      <p style="color:#7a9ab8;margin:4px 0 0 0;font-size:14px;">Relatório Diário de Negativações — ${today}</p>
    </div>
    <div style="padding:32px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="text-align:left;padding:10px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Métrica</th>
            <th style="text-align:right;padding:10px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Quantidade</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:10px 12px;font-size:14px;border-bottom:1px solid #f3f4f6;">Negativações verificadas</td>
            <td style="padding:10px 12px;font-size:14px;text-align:right;font-weight:bold;border-bottom:1px solid #f3f4f6;">${relatorio.negativacoes_verificadas}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;font-size:14px;border-bottom:1px solid #f3f4f6;">Executadas (negativadas no bureau)</td>
            <td style="padding:10px 12px;font-size:14px;text-align:right;font-weight:bold;color:#dc2626;border-bottom:1px solid #f3f4f6;">${relatorio.executadas}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;font-size:14px;border-bottom:1px solid #f3f4f6;">Canceladas por pagamento / encerramento</td>
            <td style="padding:10px 12px;font-size:14px;text-align:right;font-weight:bold;color:#16a34a;border-bottom:1px solid #f3f4f6;">${relatorio.canceladas_por_pagamento}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;font-size:14px;">Erros de processamento</td>
            <td style="padding:10px 12px;font-size:14px;text-align:right;font-weight:bold;color:${relatorio.erros.length > 0 ? '#dc2626' : '#6b7280'};">${relatorio.erros.length}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top:16px;">
        <h3 style="font-size:14px;color:#374151;margin-bottom:8px;">Detalhes de Erros</h3>
        ${errosHtml}
      </div>

      <p style="font-size:12px;color:#9ca3af;margin-top:32px;border-top:1px solid #f3f4f6;padding-top:16px;">
        Este relatório foi gerado automaticamente pelo sistema VINDEX em ${today}. Não responda a este e-mail.
      </p>
    </div>
  </div>
</body>
</html>
`
}

// ---------------------------------------------------------------------------
// Serasa stub / real call
// ---------------------------------------------------------------------------

async function chamarSerasaAPI(negativacao: Negativacao): Promise<void> {
  const serasaUrl = Deno.env.get('SERASA_API_URL')
  const serasaKey = Deno.env.get('SERASA_API_KEY')

  if (!serasaUrl || !serasaKey) {
    // Stub mode — log and return without error
    console.log(`[STUB] Serasa API não configurada — negativacao id=${negativacao.id} simulada como enviada`)
    return
  }

  const response = await fetch(`${serasaUrl}/negativar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serasaKey}`,
    },
    body: JSON.stringify({
      referencia_interna: negativacao.id,
      devedor_id: negativacao.devedor_id,
      valor: negativacao.valor,
      bureau: negativacao.bureau,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Serasa API retornou ${response.status}: ${body}`)
  }
}

// ---------------------------------------------------------------------------
// Send email via Resend
// ---------------------------------------------------------------------------

async function enviarRelatorioEmail(relatorio: Relatorio, today: string): Promise<void> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? Deno.env.get('VITE_RESPONSAVEL_EMAIL')

  if (!resendKey || !adminEmail) {
    console.warn('[EMAIL] RESEND_API_KEY ou ADMIN_EMAIL não configurados — e-mail de relatório não enviado')
    return
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: 'VINDEX <noreply@vindex.com.br>',
      to: [adminEmail],
      subject: `[VINDEX] Relatório diário de negativações — ${today}`,
      html: buildHtmlRelatorio(relatorio, today),
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`[EMAIL] Falha ao enviar relatório: ${response.status} — ${body}`)
  } else {
    console.log(`[EMAIL] Relatório enviado para ${adminEmail}`)
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const today = new Date()
  const todayStr = formatDate(today)
  // A negativacao is eligible if data_notificacao_previa <= today - 10 days
  const cutoffDate = addDays(today, -10)
  const cutoffStr = formatDate(cutoffDate)

  const relatorio: Relatorio = {
    negativacoes_verificadas: 0,
    executadas: 0,
    canceladas_por_pagamento: 0,
    erros: [],
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Variáveis de ambiente SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // 1. Fetch eligible negativacoes
  const { data: negativacoesRaw, error: fetchError } = await supabase
    .from('negativacoes')
    .select('*')
    .eq('status', 'pendente_notificacao')
    .not('data_notificacao_previa', 'is', null)
    .lte('data_notificacao_previa', cutoffStr)

  if (fetchError) {
    console.error('[FETCH] Erro ao buscar negativações:', fetchError.message)
    return new Response(
      JSON.stringify({ error: fetchError.message, relatorio }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  const negativacoes: Negativacao[] = (negativacoesRaw as Negativacao[]) ?? []
  relatorio.negativacoes_verificadas = negativacoes.length

  console.log(`[JOB] ${todayStr} — ${negativacoes.length} negativação(ões) elegíveis para processamento`)

  // 2. Process each negativacao
  for (const neg of negativacoes) {
    try {
      // 2a. Check for payments after data_notificacao_previa
      const { data: pagamentosRaw, error: pagError } = await supabase
        .from('pagamentos')
        .select('id, caso_id, valor, data_pagamento, created_at')
        .eq('caso_id', neg.caso_id)
        .gte('data_pagamento', neg.data_notificacao_previa ?? '1900-01-01')
        .limit(1)

      if (pagError) {
        throw new Error(`Erro ao consultar pagamentos para caso ${neg.caso_id}: ${pagError.message}`)
      }

      const pagamentos: Pagamento[] = (pagamentosRaw as Pagamento[]) ?? []
      const temPagamento = pagamentos.length > 0

      // 2b. Check caso status
      const { data: casoRaw, error: casoError } = await supabase
        .from('casos')
        .select('id, status')
        .eq('id', neg.caso_id)
        .single()

      if (casoError) {
        throw new Error(`Erro ao consultar caso ${neg.caso_id}: ${casoError.message}`)
      }

      const caso: Caso = Array.isArray(casoRaw) ? casoRaw[0] : casoRaw
      const casoEncerrado = ['encerrado', 'pago', 'arquivado'].includes(caso?.status ?? '')

      // 2c. Cancel if paid or case closed
      if (temPagamento || casoEncerrado) {
        const motivo = temPagamento ? 'pagamento_realizado' : 'caso_encerrado'

        const { error: cancelError } = await supabase
          .from('negativacoes')
          .update({ status: 'cancelado', motivo_baixa: motivo })
          .eq('id', neg.id)

        if (cancelError) {
          throw new Error(`Erro ao cancelar negativacao ${neg.id}: ${cancelError.message}`)
        }

        // Log to eventos_timeline
        await supabase.from('eventos_timeline').insert({
          caso_id: neg.caso_id,
          tipo: 'negativacao_cancelada',
          descricao: `Negativação cancelada automaticamente (${motivo})`,
          metadata: { negativacao_id: neg.id, motivo },
          created_at: new Date().toISOString(),
        })

        relatorio.canceladas_por_pagamento++
        console.log(`[CANCELADO] negativacao ${neg.id} — motivo: ${motivo}`)
        continue
      }

      // 2d. No payment — proceed with Serasa negativation
      await chamarSerasaAPI(neg)

      const { error: updateError } = await supabase
        .from('negativacoes')
        .update({
          status: 'negativado',
          data_negativacao: todayStr,
        })
        .eq('id', neg.id)

      if (updateError) {
        throw new Error(`Erro ao atualizar negativacao ${neg.id}: ${updateError.message}`)
      }

      // Log to eventos_timeline
      await supabase.from('eventos_timeline').insert({
        caso_id: neg.caso_id,
        tipo: 'negativacao_executada',
        descricao: `Devedor negativado no bureau ${neg.bureau} — execução automática após prazo de notificação`,
        metadata: { negativacao_id: neg.id, bureau: neg.bureau, valor: neg.valor },
        created_at: new Date().toISOString(),
      })

      // Log to auditoria
      await supabase.from('auditoria').insert({
        tabela: 'negativacoes',
        registro_id: neg.id,
        acao: 'negativacao_automatica',
        descricao: `Negativação executada automaticamente pelo job monitorar-negativacoes em ${todayStr}`,
        metadata: { caso_id: neg.caso_id, bureau: neg.bureau, valor: neg.valor },
        created_at: new Date().toISOString(),
      })

      relatorio.executadas++
      console.log(`[EXECUTADO] negativacao ${neg.id} — bureau: ${neg.bureau}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      relatorio.erros.push(`negativacao ${neg.id}: ${msg}`)
      console.error(`[ERRO] negativacao ${neg.id}:`, msg)
      // Continue processing remaining records
    }
  }

  // 3. Send email report
  await enviarRelatorioEmail(relatorio, todayStr)

  console.log('[JOB] Concluído:', JSON.stringify(relatorio))

  // 4. Always return 200 (cron job pattern)
  return new Response(JSON.stringify({ success: true, date: todayStr, relatorio }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
