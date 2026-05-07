/**
 * _iuguClient.ts — Cliente HTTP interno para a API iugu.
 *
 * Auth: HTTP Basic com api_key + ':' (base64).
 * Ref: https://dev.iugu.com/reference
 *
 * SEGURANÇA: Em produção, mova as chamadas iugu para Supabase Edge Functions
 * e use IUGU_API_KEY (sem prefixo VITE_) no ambiente server-side.
 * Para sandbox/desenvolvimento, VITE_IUGU_API_KEY é suficiente.
 */

const IUGU_BASE_URL = 'https://api.iugu.com'

export class IuguAPIError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown,
    message: string,
  ) {
    super(message)
    this.name = 'IuguAPIError'
  }
}

export async function iuguFetch<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const apiKey = import.meta.env.VITE_IUGU_API_KEY
  if (!apiKey) {
    throw new Error(
      'VITE_IUGU_API_KEY não configurada. Veja .env.example.',
    )
  }

  const token = btoa(apiKey + ':')

  const res = await fetch(`${IUGU_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({ errors: res.statusText }))

  if (!res.ok) {
    throw new IuguAPIError(
      res.status,
      data,
      `iugu API ${res.status}: ${JSON.stringify(data)}`,
    )
  }

  return data as T
}

// ── Tipos base da API iugu ────────────────────────────────────

export interface IuguItemCobranca {
  description: string
  quantity: number
  price_cents: number
}

export interface IuguEndereco {
  street: string
  number: string
  district: string
  city: string
  state: string
  zip_code: string
  country?: string
}

export interface IuguPagador {
  cpf_cnpj: string
  name: string
  email: string
  phone_prefix?: string
  phone?: string
  address?: IuguEndereco
}

export interface IuguInvoiceResponse {
  id: string
  status: string
  due_date: string
  total: string
  total_cents: number
  invoice_url: string
  pdf: string | null
  identification: string | null      // linha digitável (boleto)
  bank_slip: {
    digitable_line: string | null
    barcode: string | null
  } | null
  pix: {
    qrcode: string | null            // payload EMV
    qrcode_text: string | null       // alias do qrcode
    image_uri: string | null         // base64 PNG
  } | null
  errors?: Record<string, string[]>
}

export interface IuguLinkResponse {
  id: string
  url: string
  slug: string
  status: string
}
