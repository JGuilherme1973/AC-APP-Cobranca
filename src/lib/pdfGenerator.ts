/**
 * pdfGenerator.ts — Gerador de Notificação Extrajudicial Institucional.
 * ANDRADE & CINTRA Advogados — jsPDF
 */

import jsPDF from 'jspdf'
import { format, parseISO, addDays, differenceInMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatarMoeda } from './utils'
import type { CasoCompleto } from '@/hooks/cobranca/useFichaCaso'

const CORES = {
  vinho:  [90,  18,  32]  as [number, number, number],
  ouro:   [183, 154, 90]  as [number, number, number],
  navy:   [14,  27,  42]  as [number, number, number],
  texto:  [26,  26,  26]  as [number, number, number],
  cinza:  [107, 107, 107] as [number, number, number],
  borda:  [226, 217, 200] as [number, number, number],
}

const ESCRITORIO = {
  nome:      'VINDEX — ANDRADE & CINTRA ADVOGADOS',
  subtitulo: 'A Legal Desk da A&C Advogados',
  tagline:   'Direito que Recupera. Estratégia que Protege.',
  email:     'jgac@cintraadvogados.com',
  site:      'www.andradecintra.com.br',
  telefone:  '(11) 99607-1463',
  cidade:    'São Paulo/SP',
}

function setColor(doc: jsPDF, cor: [number, number, number]) {
  doc.setTextColor(...cor)
}

function linha(doc: jsPDF, y: number, cor = CORES.borda) {
  doc.setDrawColor(...cor)
  doc.setLineWidth(0.3)
  doc.line(20, y, 190, y)
}

function secao(doc: jsPDF, titulo: string, y: number): number {
  doc.setFillColor(...CORES.vinho)
  doc.rect(20, y, 170, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(245, 245, 245)
  doc.text(titulo.toUpperCase(), 24, y + 5)
  setColor(doc, CORES.texto)
  return y + 12
}

function par(doc: jsPDF, chave: string, valor: string, x: number, y: number, largura = 85) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(doc, CORES.cinza)
  doc.text(chave.toUpperCase() + ':', x, y)

  doc.setFont('helvetica', 'normal')
  setColor(doc, CORES.texto)
  const linhas = doc.splitTextToSize(valor, largura)
  doc.text(linhas as string[], x, y + 4)
  return y + 4 + (linhas.length - 1) * 4
}

export function gerarHeaderPDF(
  doc: jsPDF,
  tema: 'escuro' | 'claro',
  tipoDocumento?: string,
): void {
  const pageWidth = doc.internal.pageSize.getWidth()

  if (tema === 'claro') {
    // Fundo marfim do cabeçalho
    doc.setFillColor(246, 242, 236)
    doc.rect(0, 0, pageWidth, 28, 'F')

    // Linha inferior dourada
    doc.setDrawColor(183, 154, 90)
    doc.setLineWidth(0.4)
    doc.line(0, 28, pageWidth, 28)

    // Ícone V (triângulo invertido duplo)
    const ix = 10, iy = 8
    doc.setDrawColor(90, 18, 32)
    doc.setLineWidth(0.8)
    // V externo
    doc.line(ix, iy, ix + 7, iy + 11)      // esq → vértice
    doc.line(ix + 14, iy, ix + 7, iy + 11) // dir → vértice
    // V interno
    doc.setLineWidth(0.5)
    doc.line(ix + 2, iy, ix + 7, iy + 9)
    doc.line(ix + 12, iy, ix + 7, iy + 9)
    // Barra superior
    doc.setLineWidth(0.6)
    doc.line(ix, iy, ix + 14, iy)
    // Losango acento
    doc.setFillColor(183, 154, 90)
    doc.rect(ix + 6.5, iy + 10.5, 1, 1, 'F')

    // Nome VINDEX
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(90, 18, 32)
    doc.text('VINDEX', 27, iy + 7)

    // Subtítulo
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(102, 102, 102)
    doc.text('A Legal Desk da A&C Advogados', 27, iy + 12)

    // Tipo do documento (lado direito)
    if (tipoDocumento) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(90, 18, 32)
      doc.text(tipoDocumento.toUpperCase(), pageWidth - 10, iy + 9, { align: 'right' })
    }
  }
}

export function gerarRodapePDF(doc: jsPDF, paginaAtual: number, totalPaginas: number): void {
  const pageWidth  = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const y = pageHeight - 12

  doc.setDrawColor(183, 154, 90)
  doc.setLineWidth(0.3)
  doc.line(10, y - 3, pageWidth - 10, y - 3)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(183, 154, 90)
  doc.text('DIREITO QUE RECUPERA. ESTRATÉGIA QUE PROTEGE.', pageWidth / 2, y, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(107, 107, 107)
  doc.text(
    'ANDRADE & CINTRA Advogados — VINDEX Legal Desk  |  jgac@cintraadvogados.com  |  (11) 99607-1463  |  www.andradecintra.com.br',
    pageWidth / 2, y + 4, { align: 'center' },
  )

  doc.text(`Página ${paginaAtual} de ${totalPaginas}`, pageWidth - 10, y + 4, { align: 'right' })
}

// ── Exportação principal ──────────────────────────────────────
export function gerarNotificacaoExtrajudicial(caso: CasoCompleto): ArrayBuffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const { titulo } = caso
  const { credor, devedor } = titulo
  const hoje   = new Date()
  const prazo  = addDays(hoje, 15)

  gerarHeaderPDF(doc, 'claro', 'Notificação Extrajudicial')

  let y = 34

  // Linha divisória dourada
  doc.setDrawColor(...CORES.ouro)
  doc.setLineWidth(0.8)
  doc.line(20, y, 190, y)
  y += 8

  // Título da notificação
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setColor(doc, CORES.navy)
  doc.text('NOTIFICAÇÃO EXTRAJUDICIAL', 105, y, { align: 'center' })
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setColor(doc, CORES.cinza)
  doc.text(
    `${ESCRITORIO.cidade}, ${format(hoje, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`,
    105, y, { align: 'center' },
  )
  y += 10

  // ── Qualificação das Partes ────────────────────────────────
  y = secao(doc, '1. Qualificação das Partes', y)

  // Notificante (credor)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(doc, CORES.vinho)
  doc.text('NOTIFICANTE (CREDOR):', 20, y)
  y += 5

  y = par(doc, 'Nome', credor.nome, 20, y) + 3
  if (credor.endereco_completo) {
    y = par(doc, 'Endereço', `${credor.endereco_completo}, ${credor.cidade}/${credor.estado}`, 20, y) + 3
  }
  if (credor.email)    y = par(doc, 'E-mail',   credor.email,    20, y) + 3
  if (credor.telefone) y = par(doc, 'Telefone', credor.telefone, 20, y) + 3

  y += 4
  linha(doc, y)
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(doc, CORES.vinho)
  doc.text('NOTIFICADO (DEVEDOR):', 20, y)
  y += 5

  y = par(doc, 'Nome', devedor.nome, 20, y) + 3
  const endereco = devedor.enderecos?.[0]
  if (endereco) y = par(doc, 'Endereço', endereco, 20, y) + 3
  const tel = devedor.telefones?.[0]
  if (tel) y = par(doc, 'Telefone', tel, 20, y) + 3

  y += 5

  // ── Do Débito ─────────────────────────────────────────────
  y = secao(doc, '2. Do Débito', y)

  const meses = Math.max(0, differenceInMonths(hoje, parseISO(titulo.data_origem)))
  const fatorJuros = Math.pow(1 + titulo.juros_mensais / 100, meses)
  const comJuros = titulo.valor_original * fatorJuros
  const multa    = titulo.valor_original * (titulo.multa_percentual / 100)
  const total    = comJuros + multa

  const linhasDebito = [
    ['Valor original da dívida',               formatarMoeda(titulo.valor_original)],
    [`Tipo do título`,                          titulo.tipo_titulo.replace(/_/g, ' ')],
    [`Data de origem / vencimento`,             `${format(parseISO(titulo.data_origem), 'dd/MM/yyyy')} / ${format(parseISO(titulo.data_vencimento), 'dd/MM/yyyy')}`],
    [`Juros moratórios (${titulo.juros_mensais}%/mês × ${meses} meses)`, formatarMoeda(comJuros - titulo.valor_original)],
    [`Multa contratual (${titulo.multa_percentual}%)`, formatarMoeda(multa)],
    [`Correção monetária (${titulo.indice_correcao})`, 'A apurar na data do pagamento'],
  ]

  for (const [k, v] of linhasDebito) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(doc, CORES.cinza)
    doc.text(k + ':', 22, y)
    doc.setFont('helvetica', 'normal')
    setColor(doc, CORES.texto)
    doc.text(v, 140, y, { align: 'right' })
    y += 6
  }

  // Total destacado
  doc.setFillColor(...CORES.vinho)
  doc.rect(20, y, 170, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(245, 245, 245)
  doc.text('VALOR TOTAL ATUALIZADO ESTIMADO:', 24, y + 6)
  doc.setTextColor(...CORES.ouro)
  doc.text(formatarMoeda(total), 188, y + 6, { align: 'right' })
  y += 16

  // ── Do Prazo ─────────────────────────────────────────────
  y = secao(doc, '3. Do Prazo para Pagamento', y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setColor(doc, CORES.texto)

  const corpoPrazo = doc.splitTextToSize(
    `Fica V. Sa. notificado(a) a efetuar o pagamento do débito acima especificado no prazo ` +
    `improrrogável de 15 (quinze) dias corridos, contados da data do recebimento desta notificação, ` +
    `ou seja, até ${format(prazo, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}, mediante ` +
    `depósito na conta bancária a ser informada pelo escritório ANDRADE & CINTRA Advogados.`,
    170,
  )
  doc.text(corpoPrazo as string[], 20, y)
  y += (corpoPrazo.length as number) * 5 + 6

  // ── Fundamento Legal ──────────────────────────────────────
  y = secao(doc, '4. Do Fundamento Legal', y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setColor(doc, CORES.texto)

  const corpoLegal = doc.splitTextToSize(
    `O presente débito tem amparo legal nos arts. 389, 394, 395 e 396 do Código Civil Brasileiro, ` +
    `que preveem o dever de indenizar por perdas e danos decorrentes do inadimplemento contratual, ` +
    `acrescidos de juros moratórios, multa e correção monetária. ` +
    `O prazo prescricional aplicável é de ${titulo.prazo_prescricional_anos} anos, nos termos do ` +
    (titulo.prazo_prescricional_anos === 5
      ? 'art. 206, §5º, I do Código Civil'
      : 'art. 205 do Código Civil (regra geral)') +
    `, com data limite para ajuizamento em ${format(parseISO(titulo.data_limite_ajuizamento), 'dd/MM/yyyy')}.`,
    170,
  )
  doc.text(corpoLegal as string[], 20, y)
  y += (corpoLegal.length as number) * 5 + 6

  // Advertência
  doc.setFillColor(252, 242, 242)
  doc.setDrawColor(254, 202, 202)
  doc.roundedRect(20, y, 170, 12, 1, 1, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(doc, CORES.vinho)
  doc.text(
    'O não atendimento desta notificação implicará na adoção das medidas judiciais cabíveis,',
    105, y + 5, { align: 'center' },
  )
  doc.text('incluindo ação judicial, protesto e inscrição em cadastros de inadimplentes.', 105, y + 9.5, { align: 'center' })
  y += 18

  // ── Rodapé / Assinatura ────────────────────────────────────
  if (y > 230) {
    doc.addPage()
    y = 20
  }

  doc.setDrawColor(...CORES.ouro)
  doc.setLineWidth(0.5)
  doc.line(20, y, 190, y)
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setColor(doc, CORES.texto)
  doc.text(`${ESCRITORIO.cidade}, ${format(hoje, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`, 105, y, { align: 'center' })
  y += 16

  // Linha de assinatura
  doc.setDrawColor(...CORES.cinza)
  doc.setLineWidth(0.3)
  doc.line(55, y, 155, y)
  y += 5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setColor(doc, CORES.navy)
  doc.text(caso.advogado?.nome ?? 'Advogado Responsável', 105, y, { align: 'center' })

  if (caso.advogado?.oab) {
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setColor(doc, CORES.cinza)
    doc.text(`OAB ${caso.advogado.oab}`, 105, y, { align: 'center' })
  }

  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(doc, CORES.cinza)
  doc.text('VINDEX — ANDRADE & CINTRA ADVOGADOS', 105, y, { align: 'center' })

  gerarRodapePDF(doc, 1, 1)

  return doc.output('arraybuffer') as ArrayBuffer
}

// Helper: dispara download do PDF no browser
export function downloadPDF(dados: ArrayBuffer, nomeArquivo: string) {
  const blob = new Blob([dados], { type: 'application/pdf' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = nomeArquivo
  link.click()
  URL.revokeObjectURL(url)
}
