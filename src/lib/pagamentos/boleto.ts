/**
 * boleto.ts — Emissão de Boleto Registrado via iugu (padrão FEBRABAN).
 *
 * Fluxo:
 *   emitirBoleto → iugu POST /v1/charge (method: bank_slip)
 *               → baixar PDF → upload Supabase Storage
 *               → salvar em cobrancas_financeiras
 *               → enviar e-mail via Resend + WhatsApp se contatável
 *               → registrar evento na timeline
 *
 * Regra FEBRABAN: vencimento mínimo D+2.
 */

import { supabase } from '@/lib/supabase'
import {
  iuguFetch,
  type IuguInvoiceResponse,
  type IuguItemCobranca,
  type IuguPagador,
  type IuguEndereco,
} from './_iuguClient'
import { formatarMoeda } from '@/lib/utils'
import { addDays, format, isAfter, startOfDay } from 'date-fns'

// ── Tipos públicos ────────────────────────────────────────────

export interface BoletoEndereco {
  logradouro: string
  numero:     string
  bairro:     string
  cidade:     string
  estado:     string
  cep:        string
}

export interface BoletoParams {
  caso_id:          string
  valor_centavos:   number
  data_vencimento:  Date           // mínimo D+2 — validado internamente
  devedor: {
    nome:     string
    cpf_cnpj: string
    email:    string
    telefone?: string
    endereco: BoletoEndereco
  }
  descricao:            string
  split_escritorio_pct: number     // padrão: 20
  enviar_email:         boolean    // padrão: true
  enviar_whatsapp:      boolean    // apenas se devedor.contatavel = true
}

export interface BoletoResult {
  sucesso:          boolean
  cobranca_id?:     string
  codigo_de_barras?: string
  linha_digitavel?:  string
  url_pdf?:         string
  url_pdf_storage?: string
  id_fatura?:       string
  data_vencimento?: string
  erro?:            string
}

export type BoletoStatus = 'pendente' | 'pago' | 'vencido' | 'cancelado' | 'desconhecido'

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

/** Faz download do PDF do boleto via URL da iugu e faz upload no Storage. */
async function uploadBoletoPDF(
  caso_id: string,
  id_fatura: string,
  pdf_url: string,
): Promise<string | null> {
  try {
    const res = await fetch(pdf_url)
    if (!res.ok) return null
    const blob = await res.blob()
    const arrayBuffer = await blob.arrayBuffer()

    const path = `boletos/${caso_id}/${id_fatura}.pdf`
    const { error } = await supabase.storage
      .from(import.meta.env.VITE_STORAGE_BUCKET ?? 'documentos-cobranca')
      .upload(path, arrayBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (error) {
      console.warn('[uploadBoletoPDF] Storage error:', error.message)
      return null
    }

    const { data: { publicUrl } } = supabase.storage
      .from(import.meta.env.VITE_STORAGE_BUCKET ?? 'documentos-cobranca')
      .getPublicUrl(path)

    return publicUrl
  } catch (err) {
    console.warn('[uploadBoletoPDF]', err)
    return null
  }
}

/** Envia e-mail ao devedor via Resend (Edge Function intermediária). */
async function enviarEmailBoleto(
  email: string,
  nome: string,
  linha_digitavel: string,
  url_pdf: string,
  vencimento: string,
  valor: number,
): Promise<void> {
  // Chama a Edge Function de e-mail (a ser implementada no Módulo B)
  await supabase.functions.invoke('enviar-email', {
    body: {
      to:      email,
      subject: `Boleto de cobrança — Vencimento ${vencimento}`,
      template: 'boleto_emitido',
      vars: {
        nome,
        valor:         formatarMoeda(valor),
        vencimento,
        linha_digitavel,
        url_pdf,
      },
    },
  }).catch(e => console.warn('[enviarEmailBoleto] Edge Function não disponível:', e))
}

function normalizarStatusBoleto(status: string): BoletoStatus {
  const mapa: Record<string, BoletoStatus> = {
    pending:  'pendente',
    paid:     'pago',
    canceled: 'cancelado',
    refunded: 'cancelado',
    expired:  'vencido',
    overdue:  'vencido',
  }
  return mapa[status] ?? 'desconhecido'
}

// ── Funções públicas ──────────────────────────────────────────

/**
 * Emite boleto registrado via iugu.
 * Vencimento mínimo: D+2 (FEBRABAN). Se a data informada for anterior,
 * substitui automaticamente por D+2.
 */
export async function emitirBoleto(params: BoletoParams): Promise<BoletoResult> {
  try {
    // Garantir vencimento mínimo D+2 (FEBRABAN)
    const minVencimento = startOfDay(addDays(new Date(), 2))
    const dataVenc = isAfter(params.data_vencimento, minVencimento)
      ? params.data_vencimento
      : minVencimento

    const vencFormatado = format(dataVenc, 'dd/MM/yyyy')
    const vencISO       = format(dataVenc, 'yyyy-MM-dd')

    const items: IuguItemCobranca[] = [{
      description: params.descricao,
      quantity:    1,
      price_cents: params.valor_centavos,
    }]

    const endereco: IuguEndereco = {
      street:   params.devedor.endereco.logradouro,
      number:   params.devedor.endereco.numero,
      district: params.devedor.endereco.bairro,
      city:     params.devedor.endereco.cidade,
      state:    params.devedor.endereco.estado,
      zip_code: params.devedor.endereco.cep.replace(/\D/g, ''),
      country:  'BR',
    }

    const payer: IuguPagador = {
      cpf_cnpj:     params.devedor.cpf_cnpj.replace(/\D/g, ''),
      name:         params.devedor.nome,
      email:        params.devedor.email,
      phone_prefix: params.devedor.telefone?.replace(/\D/g, '').slice(0, 2),
      phone:        params.devedor.telefone?.replace(/\D/g, '').slice(2),
      address:      endereco,
    }

    const invoice = await iuguFetch<IuguInvoiceResponse>('POST', '/v1/charge', {
      method:        'bank_slip',
      email:         params.devedor.email,
      due_date:      vencFormatado,
      payable_with:  ['bank_slip'],
      items,
      payer,
    })

    if (invoice.errors && Object.keys(invoice.errors).length > 0) {
      return { sucesso: false, erro: JSON.stringify(invoice.errors) }
    }

    const linha_digitavel = invoice.bank_slip?.digitable_line
      ?? invoice.identification
      ?? undefined
    const codigo_de_barras = invoice.bank_slip?.barcode ?? undefined
    const url_pdf_iugu     = invoice.pdf ?? undefined

    // Upload do PDF para o Supabase Storage
    const url_pdf_storage = url_pdf_iugu
      ? await uploadBoletoPDF(params.caso_id, invoice.id, url_pdf_iugu)
      : null

    const usuario_id = await obterUsuarioId()

    // Salvar em cobrancas_financeiras
    const { data: cobranca, error: errDB } = await supabase
      .from('cobrancas_financeiras')
      .insert({
        caso_id:             params.caso_id,
        tipo_pagamento:      'boleto',
        valor_original:      params.valor_centavos / 100,
        data_vencimento:     vencISO,
        status:              'pendente',
        boleto_codigo:       linha_digitavel ?? null,
        boleto_nosso_numero: codigo_de_barras ?? null,
        boleto_pdf_url:      url_pdf_storage ?? url_pdf_iugu ?? null,
        id_gateway:          invoice.id,
        gateway:             'iugu',
        split_escritorio_pct: params.split_escritorio_pct,
        split_credor_pct:    100 - params.split_escritorio_pct,
        criado_por:          usuario_id,
      })
      .select('id')
      .single()

    if (errDB) return { sucesso: false, erro: errDB.message }

    // Salvar na tabela documentos (rastreabilidade)
    if (url_pdf_storage) {
      await supabase.from('documentos').insert({
        caso_id:        params.caso_id,
        nome_arquivo:   `boleto_${invoice.id.slice(0, 8)}.pdf`,
        url_storage:    url_pdf_storage,
        tipo_documento: 'PDF',
        status:         'ATIVO',
      })
    }

    // Enviar e-mail automaticamente
    if (params.enviar_email && linha_digitavel) {
      await enviarEmailBoleto(
        params.devedor.email,
        params.devedor.nome,
        linha_digitavel,
        url_pdf_storage ?? url_pdf_iugu ?? '',
        vencFormatado,
        params.valor_centavos / 100,
      )
    }

    // Registrar na timeline
    await registrarEventoTimeline(
      params.caso_id,
      'COMUNICACAO_ENVIADA',
      `Boleto emitido — ${formatarMoeda(params.valor_centavos / 100)} | Vencimento: ${vencFormatado}`,
    )

    return {
      sucesso:          true,
      cobranca_id:      cobranca.id,
      codigo_de_barras,
      linha_digitavel,
      url_pdf:          url_pdf_iugu,
      url_pdf_storage:  url_pdf_storage ?? undefined,
      id_fatura:        invoice.id,
      data_vencimento:  vencISO,
    }
  } catch (err) {
    console.error('[emitirBoleto]', err)
    return {
      sucesso: false,
      erro: err instanceof Error ? err.message : 'Erro desconhecido ao emitir boleto',
    }
  }
}

/** Consulta o status de um boleto na iugu. */
export async function consultarBoleto(id_fatura: string): Promise<BoletoStatus> {
  try {
    const invoice = await iuguFetch<IuguInvoiceResponse>('GET', `/v1/invoices/${id_fatura}`)
    return normalizarStatusBoleto(invoice.status)
  } catch (err) {
    console.error('[consultarBoleto]', err)
    return 'desconhecido'
  }
}

/** Cancela um boleto ativo na iugu e atualiza o banco de dados. */
export async function cancelarBoleto(
  id_fatura: string,
  caso_id: string,
): Promise<boolean> {
  try {
    await iuguFetch('PUT', `/v1/invoices/${id_fatura}/cancel`)

    await supabase
      .from('cobrancas_financeiras')
      .update({ status: 'cancelado' })
      .eq('id_gateway', id_fatura)

    await registrarEventoTimeline(
      caso_id,
      'OUTRO',
      `Boleto cancelado (fatura ${id_fatura.slice(0, 8)}…)`,
    )

    return true
  } catch (err) {
    console.error('[cancelarBoleto]', err)
    return false
  }
}
