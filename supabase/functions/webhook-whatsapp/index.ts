/**
 * webhook-whatsapp — Supabase Edge Function (Deno).
 *
 * Receptor de mensagens do devedor via Evolution API (WhatsApp).
 * Identifica o devedor pelo número, classifica a intenção via IA
 * e salva a comunicação no banco de dados.
 *
 * Deploy: supabase functions deploy webhook-whatsapp
 * URL:    https://<project>.supabase.co/functions/v1/webhook-whatsapp
 *
 * Configurar na Evolution API:
 *   Webhook URL: https://<project>.supabase.co/functions/v1/webhook-whatsapp
 *   Eventos:     messages.upsert
 *   Header:      X-Evolution-Token: <EVOLUTION_WEBHOOK_TOKEN>
 *
 * SEMPRE retorna HTTP 200 — evita reenvios desnecessários pela Evolution API.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Tipos ─────────────────────────────────────────────────────

interface EvolutionWebhook {
  event:    string        // 'messages.upsert'
  instance: string
  data: {
    key: {
      remoteJid: string   // 'XXXXXXXXXXX@s.whatsapp.net'
      fromMe:    boolean
      id:        string
    }
    message: {
      conversation?:          string
      extendedTextMessage?: {
        text: string
      }
    }
    messageTimestamp: number
    pushName?:        string
  }
}

// ── CORS ──────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-evolution-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Helpers ───────────────────────────────────────────────────

/** Normaliza número de telefone para apenas dígitos */
function normalizarNumero(jid: string): string {
  return jid
    .replace('@s.whatsapp.net', '')
    .replace('@g.us', '')
    .replace(/\D/g, '')
}

/** Retorna os últimos N dígitos de um número */
function ultimosDigitos(numero: string, n = 11): string {
  return numero.slice(-n)
}

/** Resposta padrão 200 (cron-safe / webhook-safe) */
function ok(body: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify(body),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ── Handler principal ─────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // ── Variáveis de ambiente ──────────────────────────────────
  const supabaseUrl        = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const resendApiKey       = Deno.env.get('RESEND_API_KEY')!
  const evolutionApiUrl    = Deno.env.get('EVOLUTION_API_URL')!
  const evolutionApiKey    = Deno.env.get('EVOLUTION_API_KEY')!
  const evolutionInstance  = Deno.env.get('EVOLUTION_INSTANCE')!
  const webhookToken       = Deno.env.get('EVOLUTION_WEBHOOK_TOKEN')   // opcional
  const autoReply          = Deno.env.get('WHATSAPP_AUTO_REPLY') === 'true'
  const appBaseUrl         = Deno.env.get('APP_BASE_URL') ?? 'https://app.vindex.com.br'

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // ── 1. Validar token (opcional) ────────────────────────────
  if (webhookToken) {
    const tokenRecebido = req.headers.get('x-evolution-token')
    if (tokenRecebido !== webhookToken) {
      console.warn('[webhook-whatsapp] Token inválido:', tokenRecebido)
      // Retorna 200 mesmo assim para não expor informação ao atacante
      return ok({ ignorado: true, motivo: 'token_invalido' })
    }
  }

  // ── 2. Parse do body ───────────────────────────────────────
  let payload: EvolutionWebhook
  try {
    payload = await req.json() as EvolutionWebhook
  } catch (err) {
    console.error('[webhook-whatsapp] Payload inválido:', err)
    return ok({ ignorado: true, motivo: 'payload_invalido' })
  }

  // ── 3. Filtrar eventos irrelevantes ────────────────────────
  if (payload.event !== 'messages.upsert') {
    return ok({ ignorado: true, motivo: `evento_nao_tratado: ${payload.event}` })
  }

  if (!payload.data?.key) {
    return ok({ ignorado: true, motivo: 'payload_sem_key' })
  }

  // Ignorar mensagens enviadas por nós mesmos
  if (payload.data.key.fromMe === true) {
    return ok({ ignorado: true, motivo: 'mensagem_propria' })
  }

  // ── 4. Extrair dados da mensagem ───────────────────────────
  const numeroRaw = normalizarNumero(payload.data.key.remoteJid)
  const numero    = ultimosDigitos(numeroRaw, 13)  // preserva DDI + DDD + número
  const mensagem  =
    payload.data.message?.conversation ??
    payload.data.message?.extendedTextMessage?.text ??
    ''

  const pushName = payload.data.pushName ?? null

  if (!mensagem.trim()) {
    return ok({ ignorado: true, motivo: 'mensagem_vazia_ou_midia' })
  }

  console.log(`[webhook-whatsapp] Mensagem de ${numero}: "${mensagem.slice(0, 80)}..."`)

  // ── 5. Identificar devedor pelo número ─────────────────────
  // Tenta busca direta com o número completo
  let devedor: { id: string; nome: string } | null = null

  const tentativas = [numero, ultimosDigitos(numero, 11), ultimosDigitos(numero, 9)]

  for (const tentativa of tentativas) {
    const { data, error } = await supabase
      .from('devedores')
      .select('id, nome')
      .filter('telefones', 'cs', JSON.stringify([tentativa]))
      .maybeSingle()

    if (error) {
      console.warn(`[webhook-whatsapp] Erro ao buscar por ${tentativa}:`, error)
      continue
    }

    if (data) {
      devedor = data
      break
    }
  }

  if (!devedor) {
    console.log(`[webhook-whatsapp] Número não reconhecido: ${numero}`)
    return ok({ ignorado: true, motivo: 'numero_nao_identificado', numero })
  }

  console.log(`[webhook-whatsapp] Devedor identificado: ${devedor.nome} (${devedor.id})`)

  // ── 6. Buscar caso ativo do devedor ────────────────────────
  let casoId: string | null = null

  const { data: casoData } = await supabase
    .from('casos')
    .select('id, titulos!inner(devedor_id)')
    .eq('status', 'ATIVO')
    .eq('titulos.devedor_id', devedor.id)
    .limit(1)
    .maybeSingle()

  if (casoData) {
    casoId = casoData.id
  }

  // ── 7. Classificar intenção via IA ─────────────────────────
  let intencao = 'nao_identificado'

  try {
    const iaResp = await fetch(
      `${supabaseUrl}/functions/v1/ia-regua`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          action:   'classificar_intencao',
          resposta: mensagem,
        }),
      }
    )

    if (iaResp.ok) {
      const iaData = await iaResp.json()
      intencao = iaData?.intencao ?? iaData?.resultado ?? 'nao_identificado'
      console.log(`[webhook-whatsapp] Intenção classificada: ${intencao}`)
    } else {
      console.warn('[webhook-whatsapp] IA retornou erro:', iaResp.status)
    }
  } catch (err) {
    console.warn('[webhook-whatsapp] Falha ao chamar ia-regua:', err)
  }

  // ── 8. Salvar comunicação ──────────────────────────────────
  const { data: comunicacaoData, error: erroComm } = await supabase
    .from('comunicacoes')
    .insert({
      caso_id:            casoId,
      devedor_id:         devedor.id,
      canal:              'whatsapp',
      tipo_comunicacao:   'resposta_devedor',
      direcao:            'recebido',
      conteudo:           mensagem,
      ia_tom_detectado:   intencao,
      numero_destino:     numero,
      status:             'entregue',
      metadata: {
        push_name:          pushName,
        message_id:         payload.data.key.id,
        message_timestamp:  payload.data.messageTimestamp,
        evolution_instance: payload.instance,
      },
    })
    .select('id')
    .single()

  if (erroComm) {
    console.error('[webhook-whatsapp] Erro ao salvar comunicação:', erroComm)
  } else {
    console.log(`[webhook-whatsapp] Comunicação salva: ${comunicacaoData?.id}`)
  }

  // ── 9. Registrar na timeline ───────────────────────────────
  const descricaoTimeline = mensagem.length > 100
    ? `Mensagem recebida de ${devedor.nome}: "${mensagem.slice(0, 100)}..." — Intenção: ${intencao}`
    : `Mensagem recebida de ${devedor.nome}: "${mensagem}" — Intenção: ${intencao}`

  if (casoId) {
    await supabase.from('eventos_timeline').insert({
      caso_id:     casoId,
      devedor_id:  devedor.id,
      tipo_evento: 'MENSAGEM_WHATSAPP_RECEBIDA',
      descricao:   descricaoTimeline,
      metadata: {
        intencao,
        numero,
        comunicacao_id: comunicacaoData?.id ?? null,
      },
    })
  }

  // ── 10. Notificar advogado se intenção crítica ──────────────
  const intencoesCriticas = ['contestando_divida', 'sem_condicao_pagar']

  if (intencoesCriticas.includes(intencao) && resendApiKey) {
    try {
      // Buscar advogado do caso
      let advogadoEmail: string | null = null
      let advogadoNome:  string | null = null

      if (casoId) {
        const { data: casoAdvogado } = await supabase
          .from('casos')
          .select('usuarios (nome, email)')
          .eq('id', casoId)
          .single()

        if (casoAdvogado?.usuarios) {
          const u = casoAdvogado.usuarios as unknown as { nome: string; email: string }
          advogadoEmail = u.email
          advogadoNome  = u.nome
        }
      }

      if (advogadoEmail) {
        const casoLink = casoId
          ? `${appBaseUrl}/casos/${casoId}`
          : `${appBaseUrl}/devedores/${devedor.id}`

        const intencaoLabel: Record<string, string> = {
          contestando_divida:    'Contestando a Dívida',
          sem_condicao_pagar:    'Sem Condição de Pagar',
        }

        await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            from:    'VINDEX Alertas <alertas@vindex.com.br>',
            to:      [advogadoEmail],
            subject: `[URGENTE] Devedor ${devedor.nome} — ${intencaoLabel[intencao] ?? intencao}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #e65100; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                  <h2 style="margin: 0;">🚨 Atenção Urgente — WhatsApp</h2>
                  <p style="margin: 8px 0 0; font-size: 16px;">${intencaoLabel[intencao] ?? intencao}</p>
                </div>

                <div style="background: #fff8f0; border: 2px solid #e65100; padding: 20px; border-radius: 0 0 8px 8px;">
                  <p>Olá, <strong>${advogadoNome}</strong>.</p>

                  <p>O devedor <strong>${devedor.nome}</strong> enviou uma mensagem via WhatsApp
                  classificada como <strong>${intencaoLabel[intencao] ?? intencao}</strong>.</p>

                  <div style="background: #f5f5f5; border-left: 4px solid #e65100; padding: 16px; margin: 16px 0; border-radius: 4px;">
                    <strong>Mensagem recebida:</strong><br><br>
                    <em>"${mensagem}"</em>
                  </div>

                  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                    <tr>
                      <td style="padding: 8px; font-weight: bold; border: 1px solid #ddd; background: #f9f9f9;">Devedor</td>
                      <td style="padding: 8px; border: 1px solid #ddd;">${devedor.nome}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; font-weight: bold; border: 1px solid #ddd; background: #f9f9f9;">Número WhatsApp</td>
                      <td style="padding: 8px; border: 1px solid #ddd;">${numero}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; font-weight: bold; border: 1px solid #ddd; background: #f9f9f9;">Intenção IA</td>
                      <td style="padding: 8px; border: 1px solid #ddd; color: #c62828; font-weight: bold;">
                        ${intencaoLabel[intencao] ?? intencao}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 8px; font-weight: bold; border: 1px solid #ddd; background: #f9f9f9;">Recebido em</td>
                      <td style="padding: 8px; border: 1px solid #ddd;">
                        ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília)
                      </td>
                    </tr>
                  </table>

                  <div style="text-align: center; margin: 24px 0;">
                    <a href="${casoLink}"
                       style="background: #1976d2; color: white; padding: 12px 32px;
                              text-decoration: none; border-radius: 4px; font-weight: bold;">
                      Acessar Caso
                    </a>
                  </div>

                  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                  <p style="color: #9e9e9e; font-size: 12px;">
                    VINDEX Sistema de Cobrança — Alerta automático · webhook-whatsapp
                  </p>
                </div>
              </div>
            `,
          }),
        })

        console.log(`[webhook-whatsapp] Alerta enviado para advogado: ${advogadoEmail}`)
      }
    } catch (err) {
      console.error('[webhook-whatsapp] Erro ao enviar alerta ao advogado:', err)
    }
  }

  // ── 11. Resposta automática (opcional) ─────────────────────
  if (autoReply && evolutionApiUrl && evolutionInstance) {
    try {
      const autoReplyResp = await fetch(
        `${evolutionApiUrl}/message/sendText/${evolutionInstance}`,
        {
          method:  'POST',
          headers: {
            'apikey':       evolutionApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number: numero,
            text:   'Recebemos sua mensagem. Nossa equipe entrará em contato em breve.',
          }),
        }
      )

      if (!autoReplyResp.ok) {
        console.warn('[webhook-whatsapp] Falha ao enviar resposta automática:', autoReplyResp.status)
      } else {
        console.log(`[webhook-whatsapp] Resposta automática enviada para ${numero}`)
      }
    } catch (err) {
      console.warn('[webhook-whatsapp] Erro ao enviar resposta automática:', err)
    }
  }

  // ── 12. Resposta final ─────────────────────────────────────
  return ok({
    processado:   true,
    devedor_id:   devedor.id,
    devedor_nome: devedor.nome,
    caso_id:      casoId,
    intencao,
    numero,
  })
})
