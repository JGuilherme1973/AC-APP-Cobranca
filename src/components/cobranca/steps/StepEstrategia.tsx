/**
 * StepEstrategia — Step 4: Via processual, advogado responsável e etapa inicial.
 * Último step — botão "Abrir Caso" dispara a criação no Supabase.
 */

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { EstrategiaFormData } from '@/hooks/cobranca/useCriarCaso'
import type { ViaProcessual, EtapaCaso } from '@/types/cobranca'

// ── Schema ────────────────────────────────────────────────────
const schema = z.object({
  via_processual:      z.string().optional(),
  advogado_id:         z.string().min(1, 'Selecione o advogado responsável'),
  etapa_atual:         z.enum([
    'DIAGNOSTICO', 'ESTRATEGIA', 'COBRANCA_EXTRAJUDICIAL',
    'ACAO_JUDICIAL', 'EXECUCAO_RECUPERACAO',
  ]),
  observacoes_internas: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const VIA_PROCESSUAL_OPCOES: { value: ViaProcessual | ''; label: string }[] = [
  { value: '',                               label: 'A definir — aguardando diagnóstico' },
  { value: 'NEGOCIACAO_EXTRAJUDICIAL',       label: 'Negociação Extrajudicial Pura' },
  { value: 'ACAO_COBRANCA',                 label: 'Ação de Cobrança' },
  { value: 'ACAO_MONITORIA',                label: 'Ação Monitória' },
  { value: 'EXECUCAO_TITULO_EXTRAJUDICIAL', label: 'Execução de Título Extrajudicial' },
  { value: 'CUMPRIMENTO_SENTENCA',          label: 'Cumprimento de Sentença' },
  { value: 'JEC',                           label: 'JEC — Juizado Especial Cível' },
]

const ETAPA_OPCOES: { value: EtapaCaso; label: string; desc: string }[] = [
  { value: 'DIAGNOSTICO',            label: '1. Diagnóstico',              desc: 'Análise das provas e viabilidade' },
  { value: 'ESTRATEGIA',             label: '2. Estratégia',               desc: 'Definição da via processual' },
  { value: 'COBRANCA_EXTRAJUDICIAL', label: '3. Cobrança Extrajudicial',   desc: 'Notificação e negociação' },
  { value: 'ACAO_JUDICIAL',          label: '4. Ação Judicial',            desc: 'Ajuizamento em andamento' },
  { value: 'EXECUCAO_RECUPERACAO',   label: '5. Execução e Recuperação',   desc: 'Penhora e cumprimento' },
]

// ── Sub-componentes ───────────────────────────────────────────
function Field({
  label, error, required, children,
}: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-montserrat text-xs font-semibold uppercase tracking-wide mb-1.5"
        style={{ color: error ? '#991B1B' : '#1A1A1A' }}>
        {label}{required && <span className="ml-1" style={{ color: '#5A1220' }}>*</span>}
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

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) {
  const { error, children, className = '', ...rest } = props
  return (
    <select
      {...rest}
      className={`w-full border rounded px-3 py-2.5 text-sm font-lato bg-white
        focus:outline-none focus:ring-2 focus:ring-[#5A1220] transition-colors ${className}`}
      style={{ borderColor: error ? '#FECACA' : '#E2D9C8', color: '#1A1A1A' }}
    >
      {children}
    </select>
  )
}

// ── Step 4 ────────────────────────────────────────────────────
interface Advogado {
  id:   string
  nome: string
  oab?: string
}

interface Props {
  defaultValues?: Partial<EstrategiaFormData>
  submitting:     boolean
  erro?:          string | null
  onBack:         () => void
  onSubmit:       (data: EstrategiaFormData) => void
}

export default function StepEstrategia({ defaultValues, submitting, erro, onBack, onSubmit }: Props) {
  const [advogados, setAdvogados] = useState<Advogado[]>([])
  const [loadingAdv, setLoadingAdv] = useState(true)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      etapa_atual: 'DIAGNOSTICO',
      via_processual: '',
      ...defaultValues,
    },
  })

  // Carrega advogados do Supabase
  useEffect(() => {
    supabase
      .from('usuarios')
      .select('id, nome, oab')
      .in('role', ['ADVOGADO', 'ADMIN'])
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => {
        setAdvogados(data ?? [])
        setLoadingAdv(false)
      })
  }, [])

  const etapaAtual = watch('etapa_atual')

  const handleSubmitForm = (data: FormData) => {
    onSubmit({
      via_processual:      (data.via_processual as ViaProcessual | undefined) || undefined,
      advogado_id:         data.advogado_id,
      etapa_atual:         data.etapa_atual,
      observacoes_internas: data.observacoes_internas,
    })
  }

  return (
    <form onSubmit={handleSubmit(handleSubmitForm)} noValidate>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Via processual */}
        <div className="md:col-span-2">
          <Field label="Via Processual Recomendada">
            <Select {...register('via_processual')}>
              {VIA_PROCESSUAL_OPCOES.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Advogado responsável */}
        <div className="md:col-span-2">
          <Field label="Advogado Responsável" error={errors.advogado_id?.message} required>
            {loadingAdv ? (
              <div className="flex items-center gap-2 px-3 py-2.5 border rounded"
                style={{ borderColor: '#E2D9C8' }}>
                <Loader2 size={14} className="animate-spin" style={{ color: '#B79A5A' }} />
                <span className="font-lato text-sm" style={{ color: '#9B9B9B' }}>
                  Carregando advogados...
                </span>
              </div>
            ) : advogados.length === 0 ? (
              <div className="px-3 py-2.5 border rounded text-sm font-lato"
                style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#991B1B' }}>
                Nenhum advogado cadastrado. Configure usuários com role ADVOGADO no Supabase.
              </div>
            ) : (
              <Select {...register('advogado_id')} error={errors.advogado_id?.message}>
                <option value="">Selecione o advogado...</option>
                {advogados.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.nome}{a.oab ? ` — OAB ${a.oab}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>

      {/* Etapa inicial */}
      <div className="mt-6">
        <p className="font-montserrat text-xs font-semibold uppercase tracking-wide mb-3"
          style={{ color: '#1A1A1A' }}>
          Etapa Inicial do Fluxo <span style={{ color: '#5A1220' }}>*</span>
        </p>
        <div className="space-y-2">
          {ETAPA_OPCOES.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setValue('etapa_atual', opt.value, { shouldValidate: true })}
              className="w-full text-left flex items-center gap-4 px-4 py-3 rounded border transition-all"
              style={{
                backgroundColor: etapaAtual === opt.value ? '#5A1220' : 'white',
                borderColor:     etapaAtual === opt.value ? '#5A1220' : '#E2D9C8',
              }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
                           font-montserrat font-bold text-xs"
                style={{
                  backgroundColor: etapaAtual === opt.value ? '#B79A5A' : '#E2D9C8',
                  color:           etapaAtual === opt.value ? '#5A1220' : '#6B6B6B',
                }}
              >
                {i + 1}
              </div>
              <div>
                <p className="font-montserrat text-sm font-semibold"
                  style={{ color: etapaAtual === opt.value ? '#F5F5F5' : '#1A1A1A' }}>
                  {opt.label}
                </p>
                <p className="font-lato text-xs"
                  style={{ color: etapaAtual === opt.value ? 'rgba(245,245,245,0.7)' : '#9B9B9B' }}>
                  {opt.desc}
                </p>
              </div>
              {etapaAtual === opt.value && (
                <CheckCircle2 size={18} className="ml-auto flex-shrink-0" style={{ color: '#B79A5A' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Observações internas */}
      <div className="mt-6">
        <Field label="Observações Internas (não visíveis ao cliente)">
          <textarea
            {...register('observacoes_internas')}
            rows={4}
            placeholder="Anotações estratégicas, contexto do caso, informações sensíveis..."
            className="w-full border rounded px-3 py-2.5 text-sm font-lato bg-white resize-none
              focus:outline-none focus:ring-2 focus:ring-[#5A1220] transition-colors"
            style={{ borderColor: '#E2D9C8', color: '#1A1A1A' }}
          />
        </Field>
      </div>

      {/* Erro de envio */}
      {erro && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded mt-5 text-sm font-lato"
          style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B' }}
          role="alert"
        >
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{erro}</span>
        </div>
      )}

      {/* Navegação */}
      <div className="flex justify-between mt-8 pt-5" style={{ borderTop: '1px solid #E2D9C8' }}>
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="px-7 py-2.5 rounded font-montserrat text-sm font-semibold
                     transition-colors border disabled:opacity-50"
          style={{ borderColor: '#5A1220', color: '#5A1220', backgroundColor: 'white' }}
          onMouseEnter={e => {
            if (!submitting) Object.assign((e.currentTarget as HTMLButtonElement).style,
              { backgroundColor: '#5A1220', color: 'white' })
          }}
          onMouseLeave={e => {
            Object.assign((e.currentTarget as HTMLButtonElement).style,
              { backgroundColor: 'white', color: '#5A1220' })
          }}
        >
          ← Anterior
        </button>

        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 px-8 py-2.5 rounded font-montserrat text-sm
                     font-semibold transition-colors disabled:cursor-not-allowed"
          style={{
            backgroundColor: submitting ? '#8B7340' : '#B79A5A',
            color: '#0E1B2A',
          }}
          onMouseEnter={e => {
            if (!submitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#C8AE6C'
          }}
          onMouseLeave={e => {
            if (!submitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B79A5A'
          }}
        >
          {submitting ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Abrindo caso...
            </>
          ) : (
            'Abrir Caso →'
          )}
        </button>
      </div>
    </form>
  )
}
