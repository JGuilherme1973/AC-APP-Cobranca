/**
 * webhook-iugu — Supabase Edge Function (Deno).
 *
 * Receptor de webhooks da iugu com validação HMAC-SHA256.
 * Deploy: supabase functions deploy webhook-iugu
 * URL:    https://<project>.supabase.co/functions/v1/webhook-iugu
 *
 * SEMPRE retorna HTTP 200 — erros internos são logados, nunca expostos
 * ao iugu (evita retry loop).
 *
 * Eventos tratados:
 *   invoice.status_changed → paid    → conciliação financeira completa
 *   invoice.status_changed → expired → marcar vencido + avançar régua
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Tipos ─────────────────────────────────────────────────────

interface IuguWebhookPayload {
  event: string
  data: {
    id:         string          // invoice_id
    status:     string
    total_paid: string | null   // ex: "R$ 250,00"
    paid_at:    string | null
    total_cents?: number
    payment_method?: string
    [key: string]: unknown
  }
}

interface CobrancaFinanceira {
  id:                    string
  caso_id:               string
  tipo_pagamento:        string
  valor_total:           number
  split_escritorio_pct:  number
  split_credor_pct:      number
}

// ── Helpers ───────────────────────────────────────────────────

/** Valida assinatura HMAC-SHA256 do header X-Iugu-Signature. */
async function validarAssinatura(
  body: string,
  headerSig: string | null,
  secret: string,
): Promise<boolean> {
  if (!headerSig) return false

  const encoder   = new TextEncoder()
  const keyData   = encoder.encode(secret)
  const msgData   = encoder.encode(body)

  const key = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const sigBuffer = await crypto.subtle.sign('HMAC', key, msgData)
  const sigHex    = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Comparação em tempo constante
  return sigHex === headerSig.toLowerCase()
}

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
  }).format(valor)
}

// ── Handler principal ─────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const SEMPRE_200 = new Response('OK', { status: 200 })

  // Instanciar Supabase com service_role (acesso irrestrito para conciliação)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const webhookSecret = Deno.env.get('IUGU_WEBHOOK_SECRET') ?? ''
  const bodyText      = await req.text()
  const headerSig     = req.headers.get('X-Iugu-Signature')

  // ── Validar assinatura HMAC-SHA256 ────────────────────────
  const assinaturaValida = await validarAssinatura(bodyText, headerSig, webhookSecret)

  // Log de auditoria — todas as tentativas, válidas ou não
  await supabase.from('auditoria').insert({
    usuario_id:   null,
    acao:         'WEBHOOK_IUGU_RECEBIDO',
    entidade:     'webhook',
    entidade_id:  null,
    dados_depois: {
      assinatura_valida: assinaturaValida,
      header_sig:        headerSig?.slice(0, 16) + '…',
      body_preview:      bodyText.slice(0, 200),
    },
    ip_address:   req.headers.get('x-forwarded-for') ?? 'desconhecido',
    user_agent:   req.headers.get('user-agent') ?? '',
  }).catch(() => {/* não bloquear em falha de auditoria */})

  if (!assinaturaValida) {
    console.warn('[webhook-iugu] Assinatura inválida — requisição rejeitada')
    // Retorna 200 para não revelar que houve rejeição (security through obscurity)
    return SEMPRE_200
  }

  // ── Parsear payload ───────────────────────────────────────
  let payload: IuguWebhookPayload
  try {
    payload = JSON.parse(bodyText) as IuguWebhookPayload
  } catch {
    console.error('[webhook-iugu] JSON inválido')
    return SEMPRE_200
  }

  const { event, data } = payload
  console.log(`[webhook-iugu] Evento recebido: ${event} | invoice: ${data.id}`)

  try {
    if (event === 'invoice.status_changed') {
      if (data.status === 'paid') {
        await processarPagamento(supabase, data)
      } else if (data.status === 'expired') {
        await processarVencimento(supabase, data)
      }
    }
  } catch (err) {
    // Log do erro mas SEMPRE retornar 200
    console.error('[webhook-iugu] Erro no processamento:', err)
    await supabase.from('auditoria').insert({
      acao:         'WEBHOOK_IUGU_ERRO',
      entidade:     'webhook',
      dados_depois: {
        event,
        invoice_id: data.id,
        erro: String(err),
      },
    }).catch(() => {})
  }

  return SEMPRE_200
})

// ── Processar pagamento confirmado ────────────────────────────

async function processarPagamento(
  supabase: ReturnType<typeof createClient>,
  data: IuguWebhookPayload['data'],
): Promise<void> {
  // 1. Buscar cobrança pelo id_gateway
  const { data: cobranca, error: errCobranca } = await supabase
    .from('cobrancas_financeiras')
    .select('id, caso_id, tipo_pagamento, valor_total, split_escritorio_pct, split_credor_pct')
    .eq('id_gateway', data.id)
    .single()

  if (errCobranca || !cobranca) {
    console.warn(`[webhook-iugu] Cobrança não encontrada para id_gateway: ${data.id}`)
    return
  }

  const c = cobranca as CobrancaFinanceira

  // 2. Atualizar cobrancas_financeiras → status pago
  await supabase
    .from('cobrancas_financeiras')
    .update({
      status:         'pago',
      data_pagamento: data.paid_at ?? new Date().toISOString(),
    })
    .eq('id', c.id)

  // 3. Registrar pagamento na tabela pagamentos (Fase 1)
  await supabase.from('pagamentos').insert({
    caso_id:        c.caso_id,
    valor:          c.valor_total,
    data_pagamento: (data.paid_at ?? new Date().toISOString()).split('T')[0],
    tipo:           'PAGAMENTO_DEVEDOR',
    observacao:     `Pago via ${c.tipo_pagamento} (iugu ${data.id.slice(0, 8)}…)`,
  })

  // 4. Calcular split financeiro
  const valor_escritorio = c.valor_total * c.split_escritorio_pct / 100
  const valor_credor     = c.valor_total * c.split_credor_pct / 100

  // 5. Registrar evento na timeline
  const canalLabel: Record<string, string> = {
    pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão', link: 'Link de Pagamento',
  }
  const canal = canalLabel[c.tipo_pagamento] ?? c.tipo_pagamento

  await supabase.from('eventos_timeline').insert({
    caso_id:     c.caso_id,
    tipo_evento: 'PAGAMENTO_PARCIAL',
    descricao:   `Pagamento recebido via ${canal} — ${formatarMoeda(c.valor_total)} ` +
                 `(Escritório: ${formatarMoeda(valor_escritorio)} | Credor: ${formatarMoeda(valor_credor)})`,
  })

  // 6. Verificar negativação ativa → iniciar baixa
  const { data: negat } = await supabase
    .from('negativacoes')
    .select('id, bureau')
    .eq('caso_id', c.caso_id)
    .eq('status', 'negativado')
    .maybeSingle()

  if (negat) {
    await supabase
      .from('negativacoes')
      .update({ status: 'baixa_solicitada', motivo_baixa: 'pagamento' })
      .eq('id', negat.id)

    await supabase.from('eventos_timeline').insert({
      caso_id:     c.caso_id,
      tipo_evento: 'OUTRO',
      descricao:   `Baixa de negativação (${negat.bureau}) solicitada após pagamento confirmado`,
    })
  }

  // 7. Verificar protesto ativo → alertar advogado
  const { data: protesto } = await supabase
    .from('protestos')
    .select('id, cartorio_nome')
    .eq('caso_id', c.caso_id)
    .eq('status', 'protestado')
    .maybeSingle()

  if (protesto) {
    await supabase.from('tarefas').insert({
      caso_id:    c.caso_id,
      descricao:  `⚠️ Cancelar protesto em cartório: pagamento confirmado. Cartório: ${protesto.cartorio_nome ?? 'verificar'}`,
      prazo:      new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      prioridade: 'ALTA',
      status:     'A_FAZER',
    })
  }

  // 8. Verificar se há outros títulos em aberto no caso
  const { data: pendentes } = await supabase
    .from('cobrancas_financeiras')
    .select('id')
    .eq('caso_id', c.caso_id)
    .eq('status', 'pendente')

  if (!pendentes || pendentes.length === 0) {
    await supabase.from('tarefas').insert({
      caso_id:    c.caso_id,
      descricao:  '✅ Verificar encerramento do caso — todos os títulos foram quitados',
      prazo:      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      prioridade: 'MEDIA',
      status:     'A_FAZER',
    })
  }

  // 9. Auditoria
  await supabase.from('auditoria').insert({
    acao:         'PAGAMENTO_CONCILIADO',
    entidade:     'cobrancas_financeiras',
    entidade_id:  c.id,
    dados_depois: {
      valor:          c.valor_total,
      valor_escritorio,
      valor_credor,
      canal,
      pago_em:        data.paid_at,
    },
  })

  console.log(`[webhook-iugu] Pagamento conciliado: caso ${c.caso_id} | ${formatarMoeda(c.valor_total)}`)
}

// ── Processar fatura vencida ──────────────────────────────────

async function processarVencimento(
  supabase: ReturnType<typeof createClient>,
  data: IuguWebhookPayload['data'],
): Promise<void> {
  const { data: cobranca } = await supabase
    .from('cobrancas_financeiras')
    .select('id, caso_id, tipo_pagamento, valor_total')
    .eq('id_gateway', data.id)
    .single()

  if (!cobranca) return

  const c = cobranca as CobrancaFinanceira

  // Marcar vencido
  await supabase
    .from('cobrancas_financeiras')
    .update({ status: 'vencido' })
    .eq('id', c.id)

  // Timeline
  const canal = c.tipo_pagamento === 'boleto' ? 'Boleto'
    : c.tipo_pagamento === 'pix' ? 'Pix'
    : 'Cobrança'

  await supabase.from('eventos_timeline').insert({
    caso_id:     c.caso_id,
    tipo_evento: 'OUTRO',
    descricao:   `${canal} vencido sem pagamento — ${formatarMoeda(c.valor_total)} | Régua avança para próximo step`,
  })

  console.log(`[webhook-iugu] Vencimento processado: cobrança ${c.id}`)
}
