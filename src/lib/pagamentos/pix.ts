/**
 * pix.ts — Serviço Pix via iugu API.
 *
 * Fluxo:
 *   gerarCobrancaPix → iugu POST /v1/charge (method: pix)
 *                    → salvar em cobrancas_financeiras
 *                    → registrar evento na timeline
 *
 * Conciliação de pagamento: via webhook (supabase/functions/webhook-iugu).
 */

import { supabase } from '@/lib/supabase'
import { iuguFetch, type IuguInvoiceResponse, type IuguItemCobranca, type IuguPagador } from './_iuguClient'
import { formatarMoeda } from '@/lib/utils'
import { addDays, format } from 'date-fns'

// ── Tipos públicos ────────────────────────────────────────────

export interface PixCobrancaParams {
  caso_id:           string
  valor_centavos:    number
  vencimento_dias:   number          // padrão: 3
  devedor: {
    nome:     string
    cpf_cnpj: string
    email:    string
  }
  descricao:           string
  split_escritorio_pct: number       // padrão: 20
}

export interface PixCobrancaResult {
  sucesso:         boolean
  cobranca_id?:    string            // UUID em cobrancas_financeiras
  txid?:           string
  qrcode_base64?:  string
  copia_e_cola?:   string
  id_fatura?:      string
  data_vencimento?: string
  erro?:           string
}

export type PixStatus = 'pendente' | 'pago' | 'expirado' | 'cancelado' | 'desconhecido'

// ── Helpers internos ──────────────────────────────────────────

async function obterUsuarioId(): Promise<string | null> {
  const { data: me } = await supabase.auth.getUser()
  if (!me.user) return null
  const { data } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_id', me.user.id)
    .single()
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

function normalizarStatusIugu(status: string): PixStatus {
  const mapa: Record<string, PixStatus> = {
    pending:   'pendente',
    paid:      'pago',
    canceled:  'cancelado',
    refunded:  'cancelado',
    expired:   'expirado',
    in_analysis: 'pendente',
  }
  return mapa[status] ?? 'desconhecido'
}

// ── Funções públicas ──────────────────────────────────────────

/**
 * Gera uma cobrança Pix dinâmico via iugu.
 * Salva em cobrancas_financeiras e registra na timeline.
 */
export async function gerarCobrancaPix(
  params: PixCobrancaParams,
): Promise<PixCobrancaResult> {
  try {
    const vencimento = format(addDays(new Date(), params.vencimento_dias), 'dd/MM/yyyy')

    const items: IuguItemCobranca[] = [{
      description: params.descricao,
      quantity:    1,
      price_cents: params.valor_centavos,
    }]

    const payer: IuguPagador = {
      cpf_cnpj: params.devedor.cpf_cnpj.replace(/\D/g, ''),
      name:     params.devedor.nome,
      email:    params.devedor.email,
    }

    const invoice = await iuguFetch<IuguInvoiceResponse>('POST', '/v1/charge', {
      method:          'pix',
      email:           params.devedor.email,
      due_date:        vencimento,
      ignore_due_email: false,
      payable_with:    ['pix'],
      items,
      payer,
    })

    if (invoice.errors && Object.keys(invoice.errors).length > 0) {
      return { sucesso: false, erro: JSON.stringify(invoice.errors) }
    }

    const qrcode_base64 = invoice.pix?.image_uri?.replace(/^data:image\/\w+;base64,/, '') ?? undefined
    const copia_e_cola  = invoice.pix?.qrcode ?? invoice.pix?.qrcode_text ?? undefined
    const data_venc     = format(addDays(new Date(), params.vencimento_dias), 'yyyy-MM-dd')

    // Salvar em cobrancas_financeiras
    const { data: cobranca, error: errDB } = await supabase
      .from('cobrancas_financeiras')
      .insert({
        caso_id:             params.caso_id,
        tipo_pagamento:      'pix',
        valor_original:      params.valor_centavos / 100,
        data_vencimento:     data_venc,
        status:              'pendente',
        pix_txid:            invoice.id,        // iugu usa o invoice id como txid
        pix_qrcode:          qrcode_base64 ?? null,
        pix_copia_cola:      copia_e_cola ?? null,
        id_gateway:          invoice.id,
        gateway:             'iugu',
        split_escritorio_pct: params.split_escritorio_pct,
        split_credor_pct:    100 - params.split_escritorio_pct,
        criado_por:          await obterUsuarioId(),
      })
      .select('id')
      .single()

    if (errDB) return { sucesso: false, erro: errDB.message }

    // Registrar na timeline
    const valorFmt = formatarMoeda(params.valor_centavos / 100)
    await registrarEventoTimeline(
      params.caso_id,
      'COMUNICACAO_ENVIADA',
      `Pix gerado — ${valorFmt} | Vencimento: ${vencimento}`,
    )

    return {
      sucesso:          true,
      cobranca_id:      cobranca.id,
      txid:             invoice.id,
      qrcode_base64,
      copia_e_cola,
      id_fatura:        invoice.id,
      data_vencimento:  data_venc,
    }
  } catch (err) {
    console.error('[gerarCobrancaPix]', err)
    return {
      sucesso: false,
      erro: err instanceof Error ? err.message : 'Erro desconhecido ao gerar Pix',
    }
  }
}

/**
 * Consulta o status atual de uma cobrança Pix via iugu.
 */
export async function consultarStatusPix(id_fatura: string): Promise<PixStatus> {
  try {
    const invoice = await iuguFetch<IuguInvoiceResponse>('GET', `/v1/invoices/${id_fatura}`)
    return normalizarStatusIugu(invoice.status)
  } catch (err) {
    console.error('[consultarStatusPix]', err)
    return 'desconhecido'
  }
}

/**
 * Cancela uma cobrança Pix ativa na iugu e atualiza o banco de dados.
 */
export async function cancelarCobrancaPix(
  id_fatura_iugu: string,
  caso_id: string,
): Promise<boolean> {
  try {
    await iuguFetch('PUT', `/v1/invoices/${id_fatura_iugu}/cancel`)

    await supabase
      .from('cobrancas_financeiras')
      .update({ status: 'cancelado' })
      .eq('id_gateway', id_fatura_iugu)

    await registrarEventoTimeline(
      caso_id,
      'OUTRO',
      `Cobrança Pix cancelada (fatura ${id_fatura_iugu.slice(0, 8)}…)`,
    )

    return true
  } catch (err) {
    console.error('[cancelarCobrancaPix]', err)
    return false
  }
}
