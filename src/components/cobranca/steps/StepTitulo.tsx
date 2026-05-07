/**
 * StepTitulo — Step 3: Cadastro do Título/Crédito.
 * Cálculo de prescrição em tempo real + valor atualizado + upload de documentos.
 */

import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, parseISO, differenceInMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertCircle, Upload, FileText, X, Scale, TrendingUp } from 'lucide-react'
import {
  calcularPrazoPrescricial,
  calcularDataLimiteAjuizamento,
  calcularStatusPrescricao,
  calcularDiasRestantes,
} from '@/lib/calculosPrescricao'
import { formatarMoeda } from '@/lib/utils'
import type { TituloFormData } from '@/hooks/cobranca/useCriarCaso'
import type { TipoTitulo, IndiceCorrecao, StatusPrescricao } from '@/types/cobranca'

// ── Schema ────────────────────────────────────────────────────
const schema = z.object({
  tipo_titulo:       z.enum([
    'CONTRATO_ASSINADO', 'NOTA_PROMISSORIA', 'CONFISSAO_DIVIDA', 'CHEQUE',
    'DUPLICATA', 'COMPROVANTE_PIX_TED_DOC', 'PROVA_DIGITAL',
    'SENTENCA_JUDICIAL', 'OUTRO',
  ]),
  valor_original:    z.coerce.number({ invalid_type_error: 'Valor inválido' })
    .positive('Valor deve ser maior que zero'),
  data_origem:       z.string().min(1, 'Data de origem obrigatória'),
  data_vencimento:   z.string().min(1, 'Data de vencimento obrigatória'),
  indice_correcao:   z.enum(['IPCA', 'IGPM', 'SELIC', 'CONTRATUAL']),
  juros_mensais:     z.coerce.number().min(0, 'Juros não pode ser negativo').max(30, 'Máx. 30%/mês'),
  multa_percentual:  z.coerce.number().min(0, 'Multa não pode ser negativa').max(100),
  observacoes_prova: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const TIPO_TITULO_OPCOES: { value: TipoTitulo; label: string }[] = [
  { value: 'CONTRATO_ASSINADO',      label: 'Contrato Assinado com Testemunhas' },
  { value: 'NOTA_PROMISSORIA',       label: 'Nota Promissória' },
  { value: 'CONFISSAO_DIVIDA',       label: 'Confissão de Dívida' },
  { value: 'CHEQUE',                 label: 'Cheque' },
  { value: 'DUPLICATA',              label: 'Duplicata' },
  { value: 'COMPROVANTE_PIX_TED_DOC', label: 'Comprovante PIX / TED / DOC' },
  { value: 'PROVA_DIGITAL',          label: 'Prova Digital (WhatsApp, e-mail, print)' },
  { value: 'SENTENCA_JUDICIAL',      label: 'Sentença Judicial' },
  { value: 'OUTRO',                  label: 'Outro' },
]

const INDICE_OPCOES: { value: IndiceCorrecao; label: string }[] = [
  { value: 'IPCA',        label: 'IPCA — Índice de Preços ao Consumidor Amplo' },
  { value: 'IGPM',        label: 'IGP-M — Índice Geral de Preços do Mercado' },
  { value: 'SELIC',       label: 'SELIC — Taxa Básica de Juros' },
  { value: 'CONTRATUAL',  label: 'Contratual (sem índice externo)' },
]

// ── Sub-componentes ───────────────────────────────────────────
function Field({
  label, error, required, children,
}: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-montserrat text-xs font-semibold uppercase tracking-wide mb-1.5"
        style={{ color: error ? '#991B1B' : '#1A1A1A' }}>
        {label}{required && <span className="ml-1" style={{ color: '#5A1E2A' }}>*</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 flex items-center gap-1 font-lato text-xs" style={{ color: '#991B1B' }}>
          <AlertCircle size={11} />{error}
        </p>
      )}
    </div>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  const { error, className = '', ...rest } = props
  return (
    <input
      {...rest}
      className={`w-full border rounded px-3 py-2.5 text-sm font-lato bg-white
        focus:outline-none focus:ring-2 focus:ring-[#5A1E2A] transition-colors ${className}`}
      style={{ borderColor: error ? '#FECACA' : '#E2D9C8', color: '#1A1A1A' }}
    />
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) {
  const { error, className = '', children, ...rest } = props
  return (
    <select
      {...rest}
      className={`w-full border rounded px-3 py-2.5 text-sm font-lato bg-white
        focus:outline-none focus:ring-2 focus:ring-[#5A1E2A] transition-colors ${className}`}
      style={{ borderColor: error ? '#FECACA' : '#E2D9C8', color: '#1A1A1A' }}
    >
      {children}
    </select>
  )
}

// Painel de prescrição
function PrescricaoPanel({
  tipoTitulo, dataOrigem,
}: { tipoTitulo: TipoTitulo | undefined; dataOrigem: string | undefined }) {
  if (!tipoTitulo || !dataOrigem) return null

  try {
    const prazo       = calcularPrazoPrescricial(tipoTitulo)
    const dataLimite  = calcularDataLimiteAjuizamento(dataOrigem, prazo)
    const status      = calcularStatusPrescricao(dataLimite)
    const dias        = calcularDiasRestantes(dataLimite)

    const cfg: Record<StatusPrescricao, { bg: string; border: string; text: string; label: string }> = {
      VERDE:    { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534', label: 'Dentro do prazo' },
      AMARELO:  { bg: '#FFFBEB', border: '#FCD34D', text: '#92400E', label: 'Atenção — menos de 6 meses' },
      VERMELHO: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', label: 'PRESCRITO ou crítico' },
    }
    const c = cfg[status]

    const artigo = prazo === 5
      ? 'Art. 206, §5º, I, CC'
      : 'Art. 205, CC (regra geral)'

    return (
      <div className="rounded-lg p-4 mt-2" style={{ backgroundColor: c.bg, border: `1px solid ${c.border}` }}>
        <div className="flex items-center gap-2 mb-3">
          <Scale size={15} style={{ color: c.text, flexShrink: 0 }} />
          <p className="font-montserrat text-xs font-bold uppercase tracking-wide" style={{ color: c.text }}>
            Prescrição Calculada
          </p>
          <span className="ml-auto font-montserrat text-xs font-bold px-2.5 py-0.5 rounded-full"
            style={{ backgroundColor: c.border, color: c.text }}>
            {c.label}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-lato">
          <div>
            <p className="font-montserrat font-semibold mb-0.5" style={{ color: c.text, opacity: 0.7 }}>
              Prazo aplicável
            </p>
            <p className="font-semibold" style={{ color: c.text }}>
              {prazo} anos
            </p>
            <p style={{ color: c.text, opacity: 0.6 }}>{artigo}</p>
          </div>
          <div>
            <p className="font-montserrat font-semibold mb-0.5" style={{ color: c.text, opacity: 0.7 }}>
              Início do prazo
            </p>
            <p className="font-semibold" style={{ color: c.text }}>
              {format(parseISO(dataOrigem), 'dd/MM/yyyy', { locale: ptBR })}
            </p>
          </div>
          <div>
            <p className="font-montserrat font-semibold mb-0.5" style={{ color: c.text, opacity: 0.7 }}>
              Data limite
            </p>
            <p className="font-semibold" style={{ color: c.text }}>
              {format(dataLimite, 'dd/MM/yyyy', { locale: ptBR })}
            </p>
          </div>
          <div>
            <p className="font-montserrat font-semibold mb-0.5" style={{ color: c.text, opacity: 0.7 }}>
              Dias restantes
            </p>
            <p className="font-semibold" style={{ color: c.text }}>
              {dias < 0 ? `${Math.abs(dias)} dias em atraso` : `${dias} dias`}
            </p>
          </div>
        </div>
      </div>
    )
  } catch {
    return null
  }
}

// Painel de valor atualizado
function ValorAtualizadoPanel({
  valorOriginal, dataOrigem, jurosMensais, multaPercentual, indice,
}: {
  valorOriginal:   number
  dataOrigem:      string
  jurosMensais:    number
  multaPercentual: number
  indice:          IndiceCorrecao
}) {
  if (!valorOriginal || !dataOrigem || isNaN(valorOriginal)) return null
  try {
    const meses       = Math.max(0, differenceInMonths(new Date(), parseISO(dataOrigem)))
    const fatorJuros  = Math.pow(1 + (jurosMensais || 0) / 100, meses)
    const comJuros    = valorOriginal * fatorJuros
    const multa       = valorOriginal * ((multaPercentual || 0) / 100)
    const total       = comJuros + multa
    const indexado    = indice !== 'CONTRATUAL'

    return (
      <div className="rounded-lg p-4 mt-2"
        style={{ backgroundColor: '#F9F6F1', border: '1px solid #E2D9C8' }}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={15} style={{ color: '#B89C5C', flexShrink: 0 }} />
          <p className="font-montserrat text-xs font-bold uppercase tracking-wide" style={{ color: '#5A1E2A' }}>
            Valor Atualizado {indexado ? '(estimado — sem índice real)' : ''}
          </p>
        </div>
        <div className="space-y-1.5 text-xs font-lato" style={{ color: '#6B6B6B' }}>
          <div className="flex justify-between">
            <span>Valor original</span>
            <span className="font-semibold" style={{ color: '#1A1A1A' }}>{formatarMoeda(valorOriginal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Juros moratórios ({jurosMensais}%/mês × {meses} meses)</span>
            <span className="font-semibold" style={{ color: '#1A1A1A' }}>{formatarMoeda(comJuros - valorOriginal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Multa contratual ({multaPercentual}%)</span>
            <span className="font-semibold" style={{ color: '#1A1A1A' }}>{formatarMoeda(multa)}</span>
          </div>
          {indexado && (
            <div className="flex justify-between opacity-50 italic">
              <span>Correção {indice}</span>
              <span>Calculada no ajuizamento</span>
            </div>
          )}
          <div className="flex justify-between pt-2 font-montserrat font-bold text-sm"
            style={{ borderTop: '1px solid #E2D9C8', color: '#5A1E2A' }}>
            <span>TOTAL {indexado ? 'ESTIMADO' : ''}</span>
            <span>{formatarMoeda(total)}</span>
          </div>
        </div>
      </div>
    )
  } catch {
    return null
  }
}

// ── Step 3 ────────────────────────────────────────────────────
interface Props {
  defaultValues?: Partial<TituloFormData>
  arquivos?:      File[]
  onNext:         (data: TituloFormData, arquivos: File[]) => void
  onBack:         () => void
}

export default function StepTitulo({ defaultValues, arquivos: arquivosInit = [], onNext, onBack }: Props) {
  const [arquivos, setArquivos] = useState<File[]>(arquivosInit)
  const [dragOver, setDragOver] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      indice_correcao:  'IPCA',
      juros_mensais:    1,
      multa_percentual: 2,
      ...defaultValues,
    },
  })

  const tipoTitulo     = watch('tipo_titulo')
  const valorOriginal  = watch('valor_original')
  const dataOrigem     = watch('data_origem')
  const jurosMensais   = watch('juros_mensais')
  const multaPercent   = watch('multa_percentual')
  const indice         = watch('indice_correcao')

  // Drag and drop de arquivos
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type === 'application/pdf' || f.type.startsWith('image/'),
    )
    setArquivos(prev => [...prev, ...files])
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    setArquivos(prev => [...prev, ...files])
    e.target.value = ''
  }

  const removerArquivo = (i: number) => {
    setArquivos(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleSubmitForm = (data: FormData) => {
    onNext(data as TituloFormData, arquivos)
  }

  return (
    <form onSubmit={handleSubmit(handleSubmitForm)} noValidate>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Tipo do título */}
        <div className="md:col-span-2">
          <Field label="Tipo do Título / Prova do Crédito" error={errors.tipo_titulo?.message} required>
            <Select {...register('tipo_titulo')} error={errors.tipo_titulo?.message}>
              <option value="">Selecione o tipo...</option>
              {TIPO_TITULO_OPCOES.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Valor original */}
        <Field label="Valor Original da Dívida (R$)" error={errors.valor_original?.message} required>
          <Input
            {...register('valor_original')}
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            error={errors.valor_original?.message}
          />
        </Field>

        {/* Data de origem */}
        <Field label="Data de Origem" error={errors.data_origem?.message} required>
          <Input
            {...register('data_origem')}
            type="date"
            error={errors.data_origem?.message}
          />
        </Field>

        {/* Data de vencimento */}
        <Field label="Data de Vencimento" error={errors.data_vencimento?.message} required>
          <Input
            {...register('data_vencimento')}
            type="date"
            error={errors.data_vencimento?.message}
          />
        </Field>

        {/* Índice de correção */}
        <Field label="Índice de Correção Monetária" error={errors.indice_correcao?.message} required>
          <Select {...register('indice_correcao')} error={errors.indice_correcao?.message}>
            {INDICE_OPCOES.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        {/* Juros moratórios */}
        <Field label="Juros Moratórios (% ao mês)" error={errors.juros_mensais?.message} required>
          <div className="relative">
            <Input
              {...register('juros_mensais')}
              type="number"
              step="0.01"
              min="0"
              max="30"
              placeholder="1,00"
              error={errors.juros_mensais?.message}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-montserrat text-xs"
              style={{ color: '#9B9B9B' }}>%/mês</span>
          </div>
        </Field>

        {/* Multa */}
        <Field label="Multa Contratual (%)" error={errors.multa_percentual?.message} required>
          <div className="relative">
            <Input
              {...register('multa_percentual')}
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="2,00"
              error={errors.multa_percentual?.message}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-montserrat text-xs"
              style={{ color: '#9B9B9B' }}>%</span>
          </div>
        </Field>
      </div>

      {/* Painel de prescrição */}
      <div className="mt-4">
        <PrescricaoPanel
          tipoTitulo={tipoTitulo as TipoTitulo | undefined}
          dataOrigem={dataOrigem}
        />
      </div>

      {/* Painel de valor atualizado */}
      <div className="mt-3">
        <ValorAtualizadoPanel
          valorOriginal={Number(valorOriginal)}
          dataOrigem={dataOrigem}
          jurosMensais={Number(jurosMensais)}
          multaPercentual={Number(multaPercent)}
          indice={(indice as IndiceCorrecao) ?? 'IPCA'}
        />
      </div>

      {/* Observações sobre as provas */}
      <div className="mt-5">
        <Field label="Observações sobre as Provas / Documentos">
          <textarea
            {...register('observacoes_prova')}
            rows={3}
            placeholder="Descreva os documentos comprobatórios, onde estão guardados, observações relevantes..."
            className="w-full border rounded px-3 py-2.5 text-sm font-lato bg-white resize-none
              focus:outline-none focus:ring-2 focus:ring-[#5A1E2A] transition-colors"
            style={{ borderColor: '#E2D9C8', color: '#1A1A1A' }}
          />
        </Field>
      </div>

      {/* Upload de documentos */}
      <div className="mt-6 pt-5" style={{ borderTop: '1px solid #E2D9C8' }}>
        <p className="font-montserrat text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: '#9B9B9B' }}>
          Documentos (PDF ou imagens)
        </p>

        <div
          className="rounded-lg border-2 border-dashed transition-colors cursor-pointer"
          style={{ borderColor: dragOver ? '#B89C5C' : '#E2D9C8', backgroundColor: dragOver ? '#FAFAF0' : '#FAFAF8' }}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <Upload size={28} style={{ color: dragOver ? '#B89C5C' : '#C0C0C0', marginBottom: '8px' }} />
            <p className="font-montserrat text-sm font-semibold" style={{ color: '#6B6B6B' }}>
              Arraste arquivos ou clique para selecionar
            </p>
            <p className="font-lato text-xs mt-1" style={{ color: '#9B9B9B' }}>
              PDF, JPG, PNG — máx. 10 MB por arquivo
            </p>
          </div>
          <input
            id="file-input"
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {/* Lista de arquivos selecionados */}
        {arquivos.length > 0 && (
          <div className="mt-3 space-y-2">
            {arquivos.map((f, i) => (
              <div key={i}
                className="flex items-center gap-3 px-4 py-2.5 rounded border"
                style={{ borderColor: '#E2D9C8', backgroundColor: 'white' }}>
                <FileText size={16} style={{ color: '#B89C5C', flexShrink: 0 }} />
                <span className="font-lato text-sm flex-1 truncate" style={{ color: '#1A1A1A' }}>
                  {f.name}
                </span>
                <span className="font-lato text-xs flex-shrink-0" style={{ color: '#9B9B9B' }}>
                  {(f.size / 1024).toFixed(0)} KB
                </span>
                <button type="button" onClick={() => removerArquivo(i)}
                  className="p-1 rounded hover:bg-red-50 transition-colors"
                  style={{ color: '#9B9B9B' }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navegação */}
      <div className="flex justify-between mt-8 pt-5" style={{ borderTop: '1px solid #E2D9C8' }}>
        <button type="button" onClick={onBack}
          className="px-7 py-2.5 rounded font-montserrat text-sm font-semibold transition-colors border"
          style={{ borderColor: '#5A1E2A', color: '#5A1E2A', backgroundColor: 'white' }}
          onMouseEnter={e => { Object.assign((e.currentTarget as HTMLButtonElement).style, { backgroundColor: '#5A1E2A', color: 'white' }) }}
          onMouseLeave={e => { Object.assign((e.currentTarget as HTMLButtonElement).style, { backgroundColor: 'white', color: '#5A1E2A' }) }}>
          ← Anterior
        </button>
        <button type="submit"
          className="px-8 py-2.5 rounded font-montserrat text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: '#5A1E2A' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B89C5C' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#5A1E2A' }}>
          Próximo →
        </button>
      </div>
    </form>
  )
}
