/**
 * confissaoDivida.ts — Gerador de Confissão de Dívida em PDF (jsPDF).
 *
 * Gerado no navegador quando o devedor confirma o acordo no portal.
 * Serve como instrumento com validade jurídica por autenticidade digital
 * (IP, token, timestamp — Art. 225 CC + Marco Civil da Internet).
 */

import jsPDF from 'jspdf'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const CORES = {
  navy:  [14,  27,  42]  as [number, number, number],
  ouro:  [183, 154, 90]  as [number, number, number],
  texto: [26,  26,  26]  as [number, number, number],
  cinza: [107, 107, 107] as [number, number, number],
  borda: [200, 200, 200] as [number, number, number],
}

function formatarMoedaPDF(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}


export interface ConfissaoDividaParams {
  devedor_nome:      string
  devedor_email:     string
  credor_nome:       string
  valor_original:    number
  valor_acordo:      number
  valor_desconto:    number
  numero_parcelas:   number
  data_vencimento_1: string      // ISO 8601
  periodicidade:     string      // 'mensal'
  tipo_pagamento:    'avista' | 'parcelado'
  token:             string
  ip_devedor:        string
  data_aceite:       Date
}

export function gerarConfissaoDivida(p: ConfissaoDividaParams): ArrayBuffer {
  const doc  = new jsPDF({ unit: 'mm', format: 'a4' })
  const hoje = p.data_aceite
  let y = 20

  // ── Cabeçalho VINDEX ─────────────────────────────────────────
  doc.setFillColor(...CORES.navy)
  doc.rect(0, 0, 210, 38, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...CORES.ouro)
  doc.text('VINDEX', 105, 16, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 200, 200)
  doc.text('ANDRADE & CINTRA Advogados  ·  Gestão de Cobranças', 105, 23, { align: 'center' })

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(245, 245, 245)
  doc.text('CONFISSÃO DE DÍVIDA E ACORDO DE PAGAMENTO', 105, 33, { align: 'center' })

  y = 50

  // ── Preâmbulo ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...CORES.texto)

  const preambulo = doc.splitTextToSize(
    `Por meio deste instrumento particular, o(a) DEVEDOR(A) qualificado(a) abaixo, ` +
    `doravante denominado(a) simplesmente CONFITENTE, confessa dever ao CREDOR ` +
    `a quantia líquida, certa e exigível especificada na Cláusula 2, ` +
    `obrigando-se ao pagamento nas condições aqui estabelecidas.`,
    170,
  )
  doc.text(preambulo as string[], 20, y)
  y += (preambulo.length as number) * 5 + 8

  // ── Cláusula 1: Qualificação ──────────────────────────────────
  doc.setFillColor(...CORES.navy)
  doc.rect(20, y, 170, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(245, 245, 245)
  doc.text('CLÁUSULA 1 — QUALIFICAÇÃO DAS PARTES', 24, y + 5)
  y += 12

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...CORES.cinza)
  doc.text('CONFITENTE (DEVEDOR):', 20, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CORES.texto)
  doc.text(`Nome: ${p.devedor_nome}`, 22, y)
  y += 5
  doc.text(`E-mail: ${p.devedor_email}`, 22, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...CORES.cinza)
  doc.text('CREDOR / REPRESENTANTE:', 20, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CORES.texto)
  doc.text(`${p.credor_nome} — representado por ANDRADE & CINTRA Advogados`, 22, y)
  y += 10

  // ── Cláusula 2: Valor ─────────────────────────────────────────
  doc.setFillColor(...CORES.navy)
  doc.rect(20, y, 170, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(245, 245, 245)
  doc.text('CLÁUSULA 2 — DO DÉBITO CONFESSADO', 24, y + 5)
  y += 12

  const linhasValor: [string, string][] = [
    ['Valor original da dívida',    formatarMoedaPDF(p.valor_original)],
    ['Desconto concedido',          `(${formatarMoedaPDF(p.valor_desconto)})`],
    ['Valor do acordo',             formatarMoedaPDF(p.valor_acordo)],
    ['Forma de pagamento',
      p.tipo_pagamento === 'avista'
        ? 'À vista (Pix)'
        : `${p.numero_parcelas}x de ${formatarMoedaPDF(p.valor_acordo / p.numero_parcelas)} (${p.periodicidade})`],
    ['Primeiro vencimento',         format(new Date(p.data_vencimento_1 + 'T12:00:00'), 'dd/MM/yyyy')],
  ]

  for (const [chave, valor] of linhasValor) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...CORES.cinza)
    doc.text(chave + ':', 22, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...CORES.texto)
    doc.text(valor, 188, y, { align: 'right' })
    y += 6
  }
  y += 4

  // ── Cláusula 3: Fundamento ────────────────────────────────────
  doc.setFillColor(...CORES.navy)
  doc.rect(20, y, 170, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(245, 245, 245)
  doc.text('CLÁUSULA 3 — FUNDAMENTO LEGAL', 24, y + 5)
  y += 12

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...CORES.texto)

  const fundamento = doc.splitTextToSize(
    `O presente instrumento constitui confissão de dívida nos termos dos arts. 389 e seguintes ` +
    `do Código Civil Brasileiro (Lei 10.406/2002). O inadimplemento de qualquer parcela ensejará ` +
    `o vencimento antecipado de todas as demais, facultando ao credor o ajuizamento de execução ` +
    `de título extrajudicial, protesto em cartório e inclusão em cadastros de inadimplentes, ` +
    `após notificação prévia nos termos do art. 43, §2º do CDC.`,
    170,
  )
  doc.text(fundamento as string[], 20, y)
  y += (fundamento.length as number) * 5 + 10

  // ── Assinatura digital ────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 20 }

  doc.setDrawColor(...CORES.ouro)
  doc.setLineWidth(0.5)
  doc.line(20, y, 190, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...CORES.texto)
  doc.text('ACEITE DIGITAL — AUTENTICIDADE DO INSTRUMENTO', 105, y, { align: 'center' })
  y += 8

  doc.setFillColor(248, 248, 248)
  doc.setDrawColor(...CORES.borda)
  doc.roundedRect(20, y, 170, 28, 2, 2, 'FD')
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...CORES.cinza)
  const dataAceite = format(hoje, "dd 'de' MMMM 'de' yyyy 'às' HH:mm:ss", { locale: ptBR })
  doc.text(`Aceito digitalmente em: ${dataAceite}`, 24, y);         y += 5
  doc.text(`IP do dispositivo:      ${p.ip_devedor}`, 24, y);        y += 5
  doc.text(`Token de autenticação:  ${p.token.slice(0, 20)}...`, 24, y); y += 5
  doc.text(`Validade jurídica: Marco Civil da Internet (Lei 12.965/2014) + Art. 225 CC`, 24, y)
  y += 16

  // Linha de assinatura simulada
  doc.setDrawColor(...CORES.cinza)
  doc.setLineWidth(0.3)
  doc.line(40, y, 170, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...CORES.cinza)
  doc.text(p.devedor_nome, 105, y, { align: 'center' })
  y += 4
  doc.text('Confitente — Assinado eletronicamente', 105, y, { align: 'center' })

  // ── Rodapé em todas as páginas ────────────────────────────────
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...CORES.cinza)
    doc.text(
      `ANDRADE & CINTRA Advogados  ·  VINDEX  ·  jgac@cintraadvogados.com.br  ·  Página ${i} de ${total}`,
      105, 290, { align: 'center' },
    )
  }

  return doc.output('arraybuffer') as ArrayBuffer
}

export function downloadConfissao(dados: ArrayBuffer, nomeDevedor: string) {
  const blob = new Blob([dados], { type: 'application/pdf' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = `confissao-divida-${nomeDevedor.replace(/\s+/g, '-').toLowerCase()}.pdf`
  link.click()
  URL.revokeObjectURL(url)
}
