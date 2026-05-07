/**
 * linkPagamento.ts — Link de pagamento unificado via iugu.
 *
 * Um único link aceita Pix + Boleto + Cartão de crédito.
 * Rastreamento de abertura via evento webhook iugu.
 */

import { supabase } from '@/lib/supabase'
import { iuguFetch, type IuguLinkResponse } from './_iuguClient'
import { formatarMoeda } from '@/lib/utils'
import { addHours } from 'date-fns'

// ── Tipos ─────────────────────────────────────────────────────

export type ExpiracaoOpcao = 48 | 72 | 168  // horas (48h | 72h | 7 dias)

export interface LinkPagamentoParams {
  caso_id:              string
  valor_centavos:       number
  descricao:            string
  expiracao_horas:      ExpiracaoOpcao      // padrão: 48
  split_escritorio_pct: number              // padrão: 20
  max_parcelas?:        number              // padrão: 12
}

export interface LinkPagamentoResult {
  sucesso:      boolean
  cobranca_id?: string
  url?:         string
  id_link?:     string
  expira_em?:   string
  erro?:        string
}

// ── Helpers ───────────────────────────────────────────────────

async function obterUsuarioId(): Promise<string | null> {
  const { data: me } = await supabase.auth.getUser()
  if (!me.user) return null
  const { data } = await supabase
    .from('usuarios').select('id').eq('auth_id', me.user.id).single()
  return data?.id ?? null
}

async function registrarEventoTimeline(
  caso_id: string,
  tipo_evento: string,
  descricao: string,
): Promise<void> {
  const usuario_id = await obterUsuarioId()
  await supabase.from('eventos_timeline').insert({
    caso_id, tipo_evento, descricao, usuario_id,
  })
}

// ── Funções públicas ──────────────────────────────────────────

/**
 * Gera um link de pagamento unificado (Pix + Boleto + Cartão) na iugu.
 */
export async function gerarLinkPagamento(
  params: LinkPagamentoParams,
): Promise<LinkPagamentoResult> {
  try {
    const expira_em = addHours(new Date(), params.expiracao_horas)

    const link = await iuguFetch<IuguLinkResponse>('POST', '/v1/payment_links', {
      name:          params.descricao,
      price_cents:   params.valor_centavos,
      payable_with:  ['pix', 'bank_slip', 'credit_card'],
      expires_in:    params.expiracao_horas,
      max_installments_value: params.max_parcelas ?? 12,
    })

    const usuario_id = await obterUsuarioId()

    // Salvar em cobrancas_financeiras
    const { data: cobranca, error: errDB } = await supabase
      .from('cobrancas_financeiras')
      .insert({
        caso_id:             params.caso_id,
        tipo_pagamento:      'link',
        valor_original:      params.valor_centavos / 100,
        data_vencimento:     expira_em.toISOString().split('T')[0],
        status:              'pendente',
        link_pagamento:      link.url,
        link_expiracao:      expira_em.toISOString(),
        link_visualizacoes:  0,
        id_gateway:          link.id,
        gateway:             'iugu',
        split_escritorio_pct: params.split_escritorio_pct,
        split_credor_pct:    100 - params.split_escritorio_pct,
        criado_por:          usuario_id,
      })
      .select('id')
      .single()

    if (errDB) return { sucesso: false, erro: errDB.message }

    // Registrar na timeline
    const valorFmt = formatarMoeda(params.valor_centavos / 100)
    const horas    = params.expiracao_horas === 168 ? '7 dias' : `${params.expiracao_horas}h`
    await registrarEventoTimeline(
      params.caso_id,
      'COMUNICACAO_ENVIADA',
      `Link de pagamento gerado — ${valorFmt} | Expira em: ${horas}`,
    )

    return {
      sucesso:     true,
      cobranca_id: cobranca.id,
      url:         link.url,
      id_link:     link.id,
      expira_em:   expira_em.toISOString(),
    }
  } catch (err) {
    console.error('[gerarLinkPagamento]', err)
    return {
      sucesso: false,
      erro: err instanceof Error ? err.message : 'Erro desconhecido ao gerar link',
    }
  }
}

/**
 * Incrementa o contador de visualizações do link.
 * Chamado quando o webhook iugu notifica abertura do link.
 */
export async function rastrearAberturaLink(
  id_gateway: string,
): Promise<void> {
  try {
    // Buscar registro e incrementar manualmente
    const { data } = await supabase
      .from('cobrancas_financeiras')
      .select('id, link_visualizacoes')
      .eq('id_gateway', id_gateway)
      .single()

    if (data) {
      await supabase
        .from('cobrancas_financeiras')
        .update({ link_visualizacoes: ((data as { link_visualizacoes: number }).link_visualizacoes ?? 0) + 1 })
        .eq('id', (data as { id: string }).id)
    }
  } catch {
    // Silenciar — rastreamento é best-effort
  }
}

/** Monta a URL de compartilhamento WhatsApp com o link de pagamento. */
export function montarUrlWhatsAppLink(
  telefone: string,
  url_link: string,
  nomeDevedor: string,
  valorFmt: string,
): string {
  const tel = telefone.replace(/\D/g, '')
  const msg = encodeURIComponent(
    `Olá, ${nomeDevedor}!\n\n` +
    `Segue o link para quitação do débito de *${valorFmt}*:\n` +
    `${url_link}\n\n` +
    `Aceitamos Pix, Boleto e Cartão de crédito.\n` +
    `ANDRADE & CINTRA Advogados`,
  )
  return `https://wa.me/${tel}?text=${msg}`
}
