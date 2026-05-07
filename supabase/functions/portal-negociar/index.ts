/**
 * portal-negociar — API pública para o portal de renegociação self-service.
 *
 * Sem autenticação Supabase — acesso controlado exclusivamente por token UUID.
 * Usa service_role internamente para acesso ao banco.
 *
 * Actions:
 *   validar_token  → retorna dados do caso para exibição
 *   criar_acordo   → persiste o acordo e retorna ID
 *   gerar_pix      → gera QR Code Pix via iugu para o portal
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ sucesso: false, erro: 'JSON inválido' }, 400)
  }

  const { action, token } = body

  if (!token || typeof token !== 'string') {
    return json({ sucesso: false, erro: 'Token obrigatório' }, 400)
  }

  // ── Validar e buscar token ────────────────────────────────────

  const { data: portalToken, error: errToken } = await supabase
    .from('portal_tokens')
    .select('id, caso_id, devedor_id, expira_em, usado_em')
    .eq('token', token)
    .single()

  if (errToken || !portalToken) {
    return json({ sucesso: false, erro: 'Link inválido ou não encontrado.' }, 404)
  }

  if (new Date(portalToken.expira_em as string) < new Date()) {
    return json({ sucesso: false, erro: 'Este link expirou. Entre em contato com o escritório.' })
  }

  // ── Action: validar_token ─────────────────────────────────────

  if (action === 'validar_token') {
    if (portalToken.usado_em) {
      return json({ sucesso: false, erro: 'Este link já foi utilizado para um acordo.' })
    }

    const { data: caso } = await supabase
      .from('casos')
      .select(`
        id, etapa_atual,
        titulos (
          valor_original, valor_atualizado, data_vencimento,
          data_origem, juros_mensais, multa_percentual,
          credores ( nome ),
          devedores ( nome, emails, telefones )
        ),
        usuarios ( nome, email )
      `)
      .eq('id', portalToken.caso_id as string)
      .single()

    if (!caso) return json({ sucesso: false, erro: 'Caso não encontrado.' }, 404)

    const r   = caso as Record<string, unknown>
    const tit = (Array.isArray(r.titulos)  ? r.titulos[0]  : r.titulos)  as Record<string, unknown> ?? {}
    const dev = (Array.isArray(tit.devedores) ? tit.devedores[0] : tit.devedores) as Record<string, unknown> ?? {}
    const cre = (Array.isArray(tit.credores)  ? tit.credores[0]  : tit.credores)  as Record<string, unknown> ?? {}
    const adv = (Array.isArray(r.usuarios) ? r.usuarios[0] : r.usuarios) as Record<string, unknown> ?? {}

    return json({
      sucesso: true,
      caso: {
        id:               r.id,
        devedor_nome:     dev.nome,
        devedor_email:    ((dev.emails as string[]) ?? [])[0] ?? '',
        devedor_tel:      ((dev.telefones as string[]) ?? [])[0] ?? '',
        credor_nome:      cre.nome,
        advogado_nome:    adv.nome,
        advogado_email:   adv.email,
        valor_original:   tit.valor_original,
        valor_atualizado: tit.valor_atualizado,
        data_vencimento:  tit.data_vencimento,
        data_origem:      tit.data_origem,
        juros_mensais:    tit.juros_mensais,
        multa_percentual: tit.multa_percentual,
      },
    })
  }

  // ── Action: criar_acordo ──────────────────────────────────────

  if (action === 'criar_acordo') {
    if (portalToken.usado_em) {
      return json({ sucesso: false, erro: 'Este link já foi utilizado.' })
    }

    const {
      tipo,          // 'avista' | 'parcelado'
      valor_total,
      valor_desconto = 0,
      numero_parcelas = 1,
      pix_automatico = false,
      ip_cliente,
    } = body as Record<string, unknown>

    // Criar acordo
    const { data: acordo, error: errAcordo } = await supabase
      .from('acordos_parcelados')
      .insert({
        caso_id:                  portalToken.caso_id,
        valor_original:           valor_total,
        valor_desconto,
        valor_acordo:             (valor_total as number) - (valor_desconto as number),
        numero_parcelas,
        data_primeiro_vencimento: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
          .toISOString().split('T')[0],
        status:               'aceito',
        canal_aceite:         'portal_self_service',
        pix_automatico_ativo: pix_automatico,
        aceito_em:            new Date().toISOString(),
        aceito_ip:            (ip_cliente as string) ?? req.headers.get('x-forwarded-for') ?? '',
      })
      .select('id')
      .single()

    if (errAcordo || !acordo) {
      return json({ sucesso: false, erro: errAcordo?.message ?? 'Erro ao registrar acordo.' }, 500)
    }

    // Marcar token como usado
    await supabase
      .from('portal_tokens')
      .update({ usado_em: new Date().toISOString(), ip_acesso: ip_cliente ?? '' })
      .eq('id', portalToken.id)

    // Registrar consentimento LGPD
    await supabase.from('consentimentos_lgpd').insert({
      devedor_id:        portalToken.devedor_id,
      caso_id:           portalToken.caso_id,
      canal:             'portal',
      tipo_consentimento: 'cobranca',
      base_legal:        'execucao_contrato',
      texto_apresentado: 'Ao confirmar o acordo, você consente com o tratamento de seus dados ' +
                         'pessoais para fins de cobrança, nos termos do Art. 7º V da LGPD.',
      concedido:         true,
      ip_address:        (ip_cliente as string) ?? '',
    })

    // Registrar evento na timeline
    const valorFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
      .format((valor_total as number) - (valor_desconto as number))
    await supabase.from('eventos_timeline').insert({
      caso_id:     portalToken.caso_id,
      tipo_evento: 'ACORDO_FECHADO',
      descricao:   `Acordo fechado via portal self-service — ${valorFmt} ` +
                   `em ${numero_parcelas}x | IP: ${ip_cliente ?? 'desconhecido'}`,
    })

    // Notificar advogado responsável via auditoria (e-mail via Resend seria na Edge Function enviar-email)
    await supabase.from('auditoria').insert({
      acao:         'ACORDO_SELF_SERVICE',
      entidade:     'acordos_parcelados',
      entidade_id:  (acordo as Record<string, unknown>).id as string,
      dados_depois: { tipo, valor_total, valor_desconto, numero_parcelas, ip_cliente },
    })

    return json({ sucesso: true, acordo_id: (acordo as Record<string, unknown>).id })
  }

  return json({ sucesso: false, erro: `Action desconhecida: ${String(action)}` }, 400)
})
