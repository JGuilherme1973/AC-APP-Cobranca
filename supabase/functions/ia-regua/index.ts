/**
 * ia-regua — Edge Function proxy para OpenAI GPT-4o.
 *
 * Chamado por:
 *   - processar-regua (server-to-server) para personalizar mensagens
 *   - React app via supabase.functions.invoke() para sugestões ao advogado
 *
 * Actions:
 *   personalizar_mensagem | classificar_intencao | sugerir_proxima_acao
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface PersonalizarParams {
  template_base: string
  devedor: {
    nome: string
    valor_devido: number
    dias_atraso: number
    historico_respostas: string[]
    perfil_risco: string
  }
  tom: 'amigavel' | 'formal' | 'negociacao' | 'juridico'
  canal: 'whatsapp' | 'email'
}

interface SugestaoAcao {
  acao: string
  justificativa: string
  urgencia: 'baixa' | 'media' | 'alta' | 'critica'
}

const SYSTEM_PERSONALIZAR = `Você é um assistente jurídico especializado em recuperação de crédito \
para o escritório ANDRADE & CINTRA Advogados, produto VINDEX. \
Sua função é personalizar mensagens de cobrança mantendo: \
1. Tom institucional, elegante e profissional — nunca agressivo; \
2. Conformidade com o Código de Defesa do Consumidor; \
3. Linguagem adaptada ao perfil do devedor; \
4. Nunca fazer promessas de resultado; \
5. Nunca ameaçar além do que é legalmente possível. \
Retorne APENAS o texto da mensagem personalizada, sem explicações.`

const SYSTEM_CLASSIFICAR = `Classifique a intenção do devedor na mensagem recebida. \
Retorne APENAS um dos valores: vai_pagar, quer_negociar, contestando_divida, \
solicitando_prazo, sem_condicao_pagar, ignorando, outro. Nenhuma outra palavra.`

const SYSTEM_SUGERIR = `Você é um assistente jurídico do escritório ANDRADE & CINTRA Advogados. \
Analise o contexto do caso de cobrança e sugira a próxima ação mais adequada. \
Responda em JSON: {"acao": "...", "justificativa": "...", "urgencia": "baixa|media|alta|critica"}. \
Nunca sugira ações ilegais, agressivas ou que violem o CDC. \
A ação é apenas uma sugestão — o advogado decide.`

async function chamarGPT(
  systemPrompt: string,
  userContent: string,
  maxTokens = 500,
  temperatura = 0.3,
): Promise<{ conteudo: string; tokens_usados: number }> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada')

  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o'

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: temperatura,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userContent },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API ${res.status}: ${err}`)
  }

  const data = await res.json()
  return {
    conteudo:      data.choices?.[0]?.message?.content?.trim() ?? '',
    tokens_usados: data.usage?.total_tokens ?? 0,
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, ...params } = await req.json()

    if (action === 'personalizar_mensagem') {
      const p = params as PersonalizarParams
      const historico = p.devedor.historico_respostas.length > 0
        ? `\n\nHistórico de respostas: ${p.devedor.historico_respostas.join(' | ')}`
        : ''

      const userContent =
        `Template base: "${p.template_base}"\n` +
        `Devedor: ${p.devedor.nome}, perfil ${p.devedor.perfil_risco}, ` +
        `deve R$ ${p.devedor.valor_devido.toFixed(2)}, ${p.devedor.dias_atraso} dias de atraso.\n` +
        `Tom desejado: ${p.tom}. Canal: ${p.canal}.${historico}`

      const { conteudo, tokens_usados } = await chamarGPT(
        SYSTEM_PERSONALIZAR, userContent,
        Number(Deno.env.get('OPENAI_MAX_TOKENS') ?? 500),
        Number(Deno.env.get('OPENAI_TEMPERATURA') ?? 0.3),
      )

      return new Response(
        JSON.stringify({ sucesso: true, mensagem: conteudo, tokens_usados }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (action === 'classificar_intencao') {
      const { resposta } = params as { resposta: string }
      const { conteudo, tokens_usados } = await chamarGPT(
        SYSTEM_CLASSIFICAR, `Mensagem do devedor: "${resposta}"`, 20, 0,
      )

      const intencoes = [
        'vai_pagar','quer_negociar','contestando_divida',
        'solicitando_prazo','sem_condicao_pagar','ignorando','outro',
      ]
      const intencao = intencoes.find(i => conteudo.includes(i)) ?? 'outro'

      return new Response(
        JSON.stringify({ sucesso: true, intencao, tokens_usados }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (action === 'sugerir_proxima_acao') {
      const { contexto } = params as { contexto: string }
      const { conteudo, tokens_usados } = await chamarGPT(
        SYSTEM_SUGERIR, contexto, 300, 0.2,
      )

      let sugestao: SugestaoAcao
      try {
        sugestao = JSON.parse(conteudo) as SugestaoAcao
      } catch {
        sugestao = { acao: conteudo, justificativa: '', urgencia: 'media' }
      }

      return new Response(
        JSON.stringify({ sucesso: true, sugestao, tokens_usados }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ sucesso: false, erro: `Action desconhecida: ${String(action)}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[ia-regua]', err)
    return new Response(
      JSON.stringify({ sucesso: false, erro: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
