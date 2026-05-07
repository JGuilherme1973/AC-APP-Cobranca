/**
 * processar-regua — Motor da Régua de Cobrança (Edge Function Deno).
 *
 * Trigger: pg_cron diário — recomendado a cada hora entre 08h-20h:
 *   SELECT cron.schedule('regua-cobranca', '0 8-20 * * 1-6',
 *     $$SELECT net.http_post(
 *       url := 'https://<project>.supabase.co/functions/v1/processar-regua',
 *       headers := '{"Authorization": "Bearer <service_role_key>"}'::jsonb
 *     )$$
 *   );
 *
 * Retorna: { processados, disparados, erros, pulados, relatorio }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Feriados nacionais 2025–2026 ──────────────────────────────

const FERIADOS = new Set([
  // 2025
  '2025-01-01','2025-03-03','2025-03-04','2025-03-05',
  '2025-04-18','2025-04-20','2025-04-21','2025-05-01',
  '2025-06-19','2025-09-07','2025-10-12','2025-11-02',
  '2025-11-15','2025-11-20','2025-12-25',
  // 2026
  '2026-01-01','2026-02-16','2026-02-17','2026-02-18',
  '2026-04-03','2026-04-05','2026-04-21','2026-05-01',
  '2026-06-04','2026-09-07','2026-10-12','2026-11-02',
  '2026-11-15','2026-11-20','2026-12-25',
])

// ── Regras de negócio ─────────────────────────────────────────

function isHorarioComercial(agora: Date): boolean {
  // UTC-3 (Brasília)
  const brasiliaOffset = -3 * 60
  const local = new Date(agora.getTime() + brasiliaOffset * 60 * 1000)
  const horas = local.getUTCHours()
  return horas >= 8 && horas < 20
}

function isDiaUtil(agora: Date): boolean {
  const brasiliaOffset = -3 * 60
  const local   = new Date(agora.getTime() + brasiliaOffset * 60 * 1000)
  const diaSemana = local.getUTCDay()              // 0 = domingo
  if (diaSemana === 0) return false                  // domingos bloqueados
  const dataStr = local.toISOString().split('T')[0]
  return !FERIADOS.has(dataStr)
}

function diferenceInDays(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

// ── Tipos ─────────────────────────────────────────────────────

interface PassoRegua {
  dia:       number
  canal:     string     // ex: 'whatsapp', 'email', 'whatsapp_email', 'sistema'
  tom:       string
  template:  string
  acao_automatica?: string
}

interface CasoParaProcessar {
  id:             string
  regua_id:       string
  data_vencimento: string    // da titulo
  devedor_nome:   string
  devedor_email:  string
  devedor_tel:    string
  valor_atualizado: number
  perfil_risco:   string
  passos_json:    PassoRegua[]
}

interface ResultadoProcessamento {
  processados: number
  disparados:  number
  erros:       number
  pulados:     number
  relatorio:   { caso_id: string; resultado: string }[]
}

// ── Disparadores de canal ─────────────────────────────────────

async function personalizarComIA(
  supabase: ReturnType<typeof createClient>,
  template: string,
  caso: CasoParaProcessar,
  tom: string,
  canal: string,
  diasAtraso: number,
): Promise<{ texto: string; tokens: number }> {
  try {
    const { data, error } = await supabase.functions.invoke('ia-regua', {
      body: {
        action: 'personalizar_mensagem',
        template_base: template,
        devedor: {
          nome:               caso.devedor_nome,
          valor_devido:       caso.valor_atualizado,
          dias_atraso:        diasAtraso,
          historico_respostas: [],
          perfil_risco:       caso.perfil_risco,
        },
        tom,
        canal,
      },
    })
    if (error) throw error
    return { texto: data.mensagem ?? template, tokens: data.tokens_usados ?? 0 }
  } catch {
    return { texto: template, tokens: 0 }
  }
}

async function dispararWhatsApp(
  devedor_tel: string,
  mensagem: string,
): Promise<boolean> {
  const apiUrl      = Deno.env.get('EVOLUTION_API_URL')
  const apiKey      = Deno.env.get('EVOLUTION_API_KEY')
  const instancia   = Deno.env.get('EVOLUTION_INSTANCE') ?? 'andrade-cintra'

  if (!apiUrl || !apiKey) {
    console.warn('[processar-regua] Evolution API não configurada — WhatsApp pulado')
    return false
  }

  const tel = devedor_tel.replace(/\D/g, '')
  if (!tel || tel.length < 10) return false

  try {
    const res = await fetch(`${apiUrl}/message/sendText/${instancia}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number:  tel.startsWith('55') ? tel : `55${tel}`,
        options: { delay: 1200, presence: 'composing' },
        textMessage: { text: mensagem },
      }),
    })
    return res.ok
  } catch (err) {
    console.error('[processar-regua] WhatsApp error:', err)
    return false
  }
}

async function dispararEmail(
  email: string,
  nome: string,
  mensagem: string,
  template: string,
): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from   = Deno.env.get('RESEND_FROM_EMAIL') ?? 'sistema@andradecintra.com.br'
  const fromName = Deno.env.get('RESEND_FROM_NAME') ?? 'ANDRADE & CINTRA Advogados'

  if (!apiKey || !email) return false

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    `${fromName} <${from}>`,
        to:      [email],
        subject: `Notificação de cobrança — ${template.replace(/_/g, ' ')}`,
        text:    mensagem,
        html:    `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${mensagem}</pre>`,
      }),
    })
    return res.ok
  } catch (err) {
    console.error('[processar-regua] E-mail error:', err)
    return false
  }
}

// ── Verificação de silêncio (48h entre contatos no mesmo canal) ──

async function verificarSilencio(
  supabase: ReturnType<typeof createClient>,
  caso_id: string,
  canal: string,
): Promise<boolean> {
  const limite = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('execucoes_regua')
    .select('id')
    .eq('caso_id', caso_id)
    .eq('canal', canal)
    .eq('status', 'enviado')
    .gte('data_execucao', limite)
    .limit(1)

  return (data?.length ?? 0) > 0   // TRUE = silêncio ativo → pular
}

async function verificarJaExecutadoHoje(
  supabase: ReturnType<typeof createClient>,
  caso_id: string,
  step_dia: number,
): Promise<boolean> {
  const hoje = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('execucoes_regua')
    .select('id')
    .eq('caso_id', caso_id)
    .eq('step_dia', step_dia)
    .gte('data_execucao', `${hoje}T00:00:00`)
    .limit(1)

  return (data?.length ?? 0) > 0
}

// ── Processamento de um caso ──────────────────────────────────

async function processarCaso(
  supabase: ReturnType<typeof createClient>,
  caso: CasoParaProcessar,
  agora: Date,
): Promise<{ resultado: string; disparado: boolean }> {
  const dataVenc    = new Date(caso.data_vencimento + 'T00:00:00')
  const diasRelat   = diferenceInDays(agora, dataVenc)

  // Encontrar step correspondente ao dia relativo
  const passo = caso.passos_json.find(p => p.dia === diasRelat)
  if (!passo) {
    return { resultado: `Dia ${diasRelat}: sem step configurado`, disparado: false }
  }

  // Verificar se já executado hoje
  const jaExecutado = await verificarJaExecutadoHoje(supabase, caso.id, passo.dia)
  if (jaExecutado) {
    return { resultado: `Step D${diasRelat >= 0 ? '+' : ''}${diasRelat} já executado hoje`, disparado: false }
  }

  // Separar canais múltiplos (ex: 'whatsapp_email' → ['whatsapp', 'email'])
  const canais = passo.canal === 'sistema'
    ? ['sistema']
    : passo.canal.split('_').filter(c => ['whatsapp','email','sms'].includes(c))

  const resultados: string[] = []
  let algumEnviado = false

  for (const canal of canais) {
    // Verificar silêncio
    const emSilencio = await verificarSilencio(supabase, caso.id, canal)
    if (emSilencio) {
      await supabase.from('execucoes_regua').insert({
        caso_id:  caso.id, regua_id: caso.regua_id, step_dia: passo.dia,
        canal,    template_usado: passo.template, status: 'cancelado_silencio',
        ia_personalizacao_usada: false,
      })
      resultados.push(`${canal}: silêncio ativo`)
      continue
    }

    if (canal === 'sistema') {
      // Ação automática (ex: D+35 → criar protesto aguardando aprovação)
      if (passo.acao_automatica === 'executar_protesto' || passo.template === 'executar_protesto') {
        await supabase.from('protestos').insert({
          caso_id:          caso.id,
          valor:            caso.valor_atualizado,
          tipo_titulo:      'A VERIFICAR',
          status:           'aguardando_aprovacao',   // NUNCA envia sem aprovação
          data_solicitacao: agora.toISOString().split('T')[0],
        })
        resultados.push('sistema: protesto criado aguardando aprovação obrigatória')
        algumEnviado = true
      }

      await supabase.from('execucoes_regua').insert({
        caso_id: caso.id, regua_id: caso.regua_id, step_dia: passo.dia,
        canal:   'sistema', template_usado: passo.template, status: 'enviado',
        ia_personalizacao_usada: false,
      })
      continue
    }

    // Personalizar mensagem via IA
    const templateBase = `[${passo.template.replace(/_/g, ' ').toUpperCase()}]\n` +
      `Prezado(a) ${caso.devedor_nome},\n\n` +
      `Referente ao débito de R$ ${caso.valor_atualizado.toFixed(2).replace('.', ',')} ` +
      `com ${Math.abs(diasRelat)} dia(s) ${diasRelat >= 0 ? 'em atraso' : 'para o vencimento'}.\n\n` +
      `ANDRADE & CINTRA Advogados\n(11) 99607-1463`

    const { texto, tokens } = await personalizarComIA(
      supabase, templateBase, caso, passo.tom, canal, diasRelat,
    )

    // Disparar
    let status: string
    if (canal === 'whatsapp') {
      const ok = await dispararWhatsApp(caso.devedor_tel, texto)
      status = ok ? 'enviado' : 'falhou'
    } else if (canal === 'email') {
      const ok = await dispararEmail(caso.devedor_email, caso.devedor_nome, texto, passo.template)
      status = ok ? 'enviado' : 'falhou'
    } else if (canal === 'sms') {
      status = 'pendente_sms'
      console.log(`[processar-regua] SMS pendente: ${caso.devedor_tel} — "${texto.slice(0, 60)}…"`)
    } else {
      status = 'ignorado'
    }

    // Registrar em execucoes_regua (APPEND ONLY)
    const { data: exec } = await supabase.from('execucoes_regua').insert({
      caso_id:                caso.id,
      regua_id:               caso.regua_id,
      step_dia:               passo.dia,
      canal,
      template_usado:         passo.template,
      status,
      mensagem_conteudo:      texto,
      ia_personalizacao_usada: tokens > 0,
      ia_tokens_usados:       tokens > 0 ? tokens : null,
    }).select('id').single()

    // Registrar também em comunicacoes (log imutável Fase 1)
    if (status === 'enviado') {
      const dest = canal === 'whatsapp' ? caso.devedor_tel : caso.devedor_email
      await supabase.from('comunicacoes').insert({
        caso_id:       caso.id,
        canal:         canal.toUpperCase() as 'WHATSAPP' | 'EMAIL',
        tipo_template: passo.template,
        destinatario:  dest,
        conteudo:      texto,
        status_envio:  'ENVIADO',
      })
      algumEnviado = true
    }

    // Atualizar comunicacao_id no log da régua
    if (exec?.id) {
      await supabase.from('execucoes_regua')
        .update({ comunicacao_id: exec.id })
        .eq('id', exec.id)
    }

    resultados.push(`${canal}: ${status}`)
  }

  return {
    resultado:  `D${diasRelat >= 0 ? '+' : ''}${diasRelat} → ${resultados.join(', ')}`,
    disparado:  algumEnviado,
  }
}

// ── Handler principal ─────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const agora = new Date()

  // Verificar horário comercial e dia útil
  if (!isHorarioComercial(agora)) {
    console.log('[processar-regua] Fora do horário comercial (08h–20h Brasília)')
    return new Response(
      JSON.stringify({ pulados: 0, motivo: 'fora_horario_comercial' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!isDiaUtil(agora)) {
    console.log('[processar-regua] Domingo ou feriado nacional — processamento suspenso')
    return new Response(
      JSON.stringify({ pulados: 0, motivo: 'domingo_ou_feriado' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Buscar todos os casos ativos com régua definida e não pausada
  const { data: casos, error: errCasos } = await supabase
    .from('casos')
    .select(`
      id, regua_id,
      titulos (
        valor_atualizado, data_vencimento,
        devedores ( nome, emails, telefones, perfil_risco )
      ),
      regras_cobranca: regua_id ( passos_json )
    `)
    .eq('status', 'ATIVO')
    .eq('regua_pausada', false)
    .not('regua_id', 'is', null)

  if (errCasos) {
    console.error('[processar-regua] Erro ao buscar casos:', errCasos)
    return new Response(
      JSON.stringify({ erro: errCasos.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const resultado: ResultadoProcessamento = {
    processados: 0, disparados: 0, erros: 0, pulados: 0, relatorio: [],
  }

  for (const raw of (casos ?? [])) {
    try {
      const r  = raw as Record<string, unknown>
      const tit = (Array.isArray(r.titulos) ? r.titulos[0] : r.titulos) as Record<string, unknown> ?? {}
      const dev = (Array.isArray(tit.devedores) ? tit.devedores[0] : tit.devedores) as Record<string, unknown> ?? {}
      const reg = (Array.isArray(r['regras_cobranca']) ? r['regras_cobranca'][0] : r['regras_cobranca']) as Record<string, unknown> ?? {}

      const caso: CasoParaProcessar = {
        id:               r.id as string,
        regua_id:         r.regua_id as string,
        data_vencimento:  tit.data_vencimento as string ?? '',
        devedor_nome:     dev.nome as string ?? 'Devedor',
        devedor_email:    ((dev.emails as string[]) ?? [])[0] ?? '',
        devedor_tel:      ((dev.telefones as string[]) ?? [])[0] ?? '',
        valor_atualizado: tit.valor_atualizado as number ?? 0,
        perfil_risco:     dev.perfil_risco as string ?? 'desconhecido',
        passos_json:      (reg.passos_json as PassoRegua[]) ?? [],
      }

      if (!caso.data_vencimento || caso.passos_json.length === 0) {
        resultado.pulados++
        resultado.relatorio.push({ caso_id: caso.id, resultado: 'pulado: sem vencimento ou passos' })
        continue
      }

      resultado.processados++
      const { resultado: res, disparado } = await processarCaso(supabase, caso, agora)

      if (disparado) resultado.disparados++
      resultado.relatorio.push({ caso_id: caso.id, resultado: res })
    } catch (err) {
      resultado.erros++
      const id = (raw as Record<string, unknown>).id as string ?? 'desconhecido'
      console.error(`[processar-regua] Erro no caso ${id}:`, err)
      resultado.relatorio.push({ caso_id: id, resultado: `ERRO: ${String(err)}` })

      await supabase.from('auditoria').insert({
        acao:         'REGUA_ERRO_PROCESSAMENTO',
        entidade:     'casos',
        entidade_id:  id as unknown as undefined,
        dados_depois: { erro: String(err) },
      }).catch(() => {})
    }
  }

  console.log(`[processar-regua] Concluído: ${JSON.stringify(resultado)}`)

  return new Response(
    JSON.stringify(resultado),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
