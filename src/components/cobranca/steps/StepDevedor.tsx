/**
 * StepDevedor — Step 2: Cadastro do Devedor.
 * CPF/CNPJ não obrigatório (alerta). Bens conhecidos estruturados.
 */

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { mascaraCPF, mascaraCNPJ, mascaraTelefone } from '@/lib/validators'
import type { DevedorFormData } from '@/hooks/cobranca/useCriarCaso'

// ── Schema ────────────────────────────────────────────────────
const schema = z.object({
  tipo:                  z.enum(['PF', 'PJ', 'DESCONHECIDO']),
  nome:                  z.string().min(2, 'Nome obrigatório'),
  cpf_cnpj:              z.string().optional(),
  perfil_risco:          z.enum(['baixo', 'medio', 'alto', 'desconhecido']),
  enderecos:             z.array(z.object({ valor: z.string() })),
  telefones:             z.array(z.object({ valor: z.string() })),
  emails:                z.array(z.object({ valor: z.string() })),
  bens_imoveis:          z.string().optional(),
  bens_veiculos:         z.string().optional(),
  bens_contas:           z.string().optional(),
  relacionamento_credor: z.string().optional(),
  advogado_devedor:      z.string().optional(),
  contatavel_whatsapp:   z.enum(['sim', 'nao', 'tentativa']),
  observacoes:           z.string().optional(),
})

type FormData = z.infer<typeof schema>

// ── Sub-componentes ───────────────────────────────────────────
function Field({
  label, error, children, required,
}: { label: string; error?: string; children: React.ReactNode; required?: boolean }) {
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

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      rows={3}
      className="w-full border rounded px-3 py-2.5 text-sm font-lato bg-white resize-none
        focus:outline-none focus:ring-2 focus:ring-[#5A1E2A] transition-colors"
      style={{ borderColor: '#E2D9C8', color: '#1A1A1A' }}
    />
  )
}

// Lista dinâmica (endereços, telefones, e-mails)
function DynamicList({
  label, placeholder, fields, append, remove, register, fieldName, mask,
}: {
  label:       string
  placeholder: string
  fields:      { id: string }[]
  append:      (v: { valor: string }) => void
  remove:      (i: number) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register:    (name: any) => object
  fieldName:   string
  mask?:       (v: string) => string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="font-montserrat text-xs font-semibold uppercase tracking-wide"
          style={{ color: '#1A1A1A' }}>
          {label}
        </label>
        <button
          type="button"
          onClick={() => append({ valor: '' })}
          className="flex items-center gap-1 text-xs font-montserrat font-semibold transition-colors"
          style={{ color: '#B89C5C' }}
        >
          <Plus size={12} /> Adicionar
        </button>
      </div>
      <div className="space-y-2">
        {fields.length === 0 && (
          <p className="font-lato text-xs italic" style={{ color: '#9B9B9B' }}>
            Nenhum {label.toLowerCase()} cadastrado.
          </p>
        )}
        {fields.map((field, i) => (
          <div key={field.id} className="flex gap-2">
            <Input
              {...register(`${fieldName}.${i}.valor`)}
              placeholder={placeholder}
              onChange={mask ? (e => {
                const input = e.target as HTMLInputElement
                input.value = mask(input.value)
              }) : undefined}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="p-2 rounded border transition-colors hover:border-red-300 hover:text-red-500"
              style={{ borderColor: '#E2D9C8', color: '#9B9B9B' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step 2 ────────────────────────────────────────────────────
interface Props {
  defaultValues?: Partial<DevedorFormData>
  onNext:         (data: DevedorFormData) => void
  onBack:         () => void
}

export default function StepDevedor({ defaultValues, onNext, onBack }: Props) {
  const [semCPF, setSemCPF] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo:                'PF',
      perfil_risco:        'desconhecido',
      contatavel_whatsapp: 'tentativa',
      enderecos:           [{ valor: '' }],
      telefones:           [{ valor: '' }],
      emails:              [{ valor: '' }],
      ...defaultValues
        ? {
            ...defaultValues,
            enderecos: defaultValues.enderecos?.map(v => ({ valor: v })) ?? [{ valor: '' }],
            telefones: defaultValues.telefones?.map(v => ({ valor: v })) ?? [{ valor: '' }],
            emails:    defaultValues.emails?.map(v => ({ valor: v }))    ?? [{ valor: '' }],
          }
        : {},
    },
  })

  const tipo = watch('tipo')
  const { fields: endFields, append: appEnd, remove: remEnd } = useFieldArray({ control, name: 'enderecos' })
  const { fields: telFields, append: appTel, remove: remTel } = useFieldArray({ control, name: 'telefones' })
  const { fields: emlFields, append: appEml, remove: remEml } = useFieldArray({ control, name: 'emails'    })

  const handleSubmitForm = (data: FormData) => {
    const result: DevedorFormData = {
      ...data,
      cpf_cnpj:  data.cpf_cnpj?.trim() || undefined,
      enderecos: data.enderecos.map(e => e.valor).filter(Boolean),
      telefones: data.telefones.map(t => t.valor).filter(Boolean),
      emails:    data.emails.map(e => e.valor).filter(Boolean),
    }
    onNext(result)
  }

  const perfilRiscoOpts = [
    { value: 'baixo',          label: 'Baixo',          color: '#166534' },
    { value: 'medio',          label: 'Médio',          color: '#92400E' },
    { value: 'alto',           label: 'Alto',           color: '#991B1B' },
    { value: 'desconhecido',   label: 'Desconhecido',   color: '#374151' },
  ] as const

  const whatsappOpts = [
    { value: 'sim',       label: 'Sim'       },
    { value: 'nao',       label: 'Não'       },
    { value: 'tentativa', label: 'Tentativa' },
  ] as const

  const perfilAtual = watch('perfil_risco')
  const wpAtual     = watch('contatavel_whatsapp')

  return (
    <form onSubmit={handleSubmit(handleSubmitForm)} noValidate>

      {/* Tipo */}
      <div className="mb-6">
        <p className="font-montserrat text-xs font-semibold uppercase tracking-wide mb-2"
          style={{ color: '#1A1A1A' }}>
          Tipo <span style={{ color: '#5A1E2A' }}>*</span>
        </p>
        <div className="flex gap-2">
          {(['PF', 'PJ', 'DESCONHECIDO'] as const).map(t => (
            <button key={t} type="button"
              onClick={() => setValue('tipo', t, { shouldValidate: true })}
              className="px-4 py-2 rounded font-montserrat text-xs font-semibold transition-all border"
              style={{
                backgroundColor: tipo === t ? '#5A1E2A' : 'white',
                color:           tipo === t ? 'white'   : '#6B6B6B',
                borderColor:     tipo === t ? '#5A1E2A' : '#E2D9C8',
              }}>
              {t === 'PF' ? 'Pessoa Física' : t === 'PJ' ? 'Pessoa Jurídica' : 'Desconhecido'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nome */}
        <div className="md:col-span-2">
          <Field label="Nome / Razão Social" error={errors.nome?.message} required>
            <Input {...register('nome')} placeholder="Nome completo ou razão social" error={errors.nome?.message} />
          </Field>
        </div>

        {/* CPF / CNPJ */}
        <div className="md:col-span-2">
          <Field label={tipo === 'PJ' ? 'CNPJ' : 'CPF'}>
            {!semCPF ? (
              <>
                <Input
                  {...register('cpf_cnpj')}
                  placeholder={tipo === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                  onChange={e => {
                    const v = tipo === 'PJ' ? mascaraCNPJ(e.target.value) : mascaraCPF(e.target.value)
                    setValue('cpf_cnpj', v)
                  }}
                />
                <div className="mt-1 flex items-center gap-2">
                  <button type="button" onClick={() => { setSemCPF(true); setValue('cpf_cnpj', '') }}
                    className="font-lato text-xs" style={{ color: '#9B9B9B', textDecoration: 'underline' }}>
                    CPF/CNPJ não disponível
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 rounded"
                style={{ backgroundColor: '#FFFBEB', border: '1px solid #FCD34D' }}>
                <AlertTriangle size={15} style={{ color: '#92400E', flexShrink: 0 }} />
                <p className="font-lato text-xs" style={{ color: '#92400E' }}>
                  CPF/CNPJ não informado. Consultas patrimoniais (SISBAJUD, RENAJUD) estarão limitadas.
                </p>
                <button type="button" onClick={() => setSemCPF(false)}
                  className="ml-auto font-montserrat text-xs font-semibold flex-shrink-0"
                  style={{ color: '#92400E' }}>
                  Informar
                </button>
              </div>
            )}
          </Field>
        </div>
      </div>

      {/* Perfil de risco */}
      <div className="mt-5">
        <p className="font-montserrat text-xs font-semibold uppercase tracking-wide mb-2"
          style={{ color: '#1A1A1A' }}>
          Perfil de risco <span style={{ color: '#5A1E2A' }}>*</span>
        </p>
        <div className="flex gap-2 flex-wrap">
          {perfilRiscoOpts.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => setValue('perfil_risco', opt.value, { shouldValidate: true })}
              className="px-4 py-2 rounded font-montserrat text-xs font-semibold transition-all border"
              style={{
                backgroundColor: perfilAtual === opt.value ? opt.color : 'white',
                color:           perfilAtual === opt.value ? 'white'   : opt.color,
                borderColor:     opt.color,
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contatos */}
      <div className="mt-6 pt-5 grid grid-cols-1 md:grid-cols-3 gap-6"
        style={{ borderTop: '1px solid #E2D9C8' }}>
        <DynamicList
          label="Endereços" placeholder="Endereço completo"
          fields={endFields} append={appEnd} remove={remEnd}
          register={register} fieldName="enderecos"
        />
        <DynamicList
          label="Telefones" placeholder="(11) 99999-9999"
          fields={telFields} append={appTel} remove={remTel}
          register={register} fieldName="telefones" mask={mascaraTelefone}
        />
        <DynamicList
          label="E-mails" placeholder="email@exemplo.com"
          fields={emlFields} append={appEml} remove={remEml}
          register={register} fieldName="emails"
        />
      </div>

      {/* Bens conhecidos */}
      <div className="mt-6 pt-5" style={{ borderTop: '1px solid #E2D9C8' }}>
        <p className="font-montserrat text-xs font-semibold uppercase tracking-widest mb-4"
          style={{ color: '#9B9B9B' }}>
          Bens Conhecidos (um por linha)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Imóveis">
            <Textarea {...register('bens_imoveis')}
              placeholder={"Rua das Flores, 100 — SP\nApto 42, Ed. Central"} />
          </Field>
          <Field label="Veículos">
            <Textarea {...register('bens_veiculos')}
              placeholder={"Honda Civic 2022 — ABC-1D23\nFord F-150 2020"} />
          </Field>
          <Field label="Contas Bancárias">
            <Textarea {...register('bens_contas')}
              placeholder={"Itaú — Ag. 1234 — C/C 56789-0\nNubank — CPF vinculado"} />
          </Field>
        </div>
      </div>

      {/* Informações adicionais */}
      <div className="mt-6 pt-5 grid grid-cols-1 md:grid-cols-2 gap-4"
        style={{ borderTop: '1px solid #E2D9C8' }}>
        <Field label="Relacionamento com o Credor">
          <Input {...register('relacionamento_credor')}
            placeholder="ex: Ex-sócio, cliente, fornecedor" />
        </Field>
        <Field label="Advogado do Devedor">
          <Input {...register('advogado_devedor')}
            placeholder="Nome e OAB (se conhecido)" />
        </Field>

        {/* Contatável WhatsApp */}
        <div>
          <p className="font-montserrat text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: '#1A1A1A' }}>
            Contatável via WhatsApp? <span style={{ color: '#5A1E2A' }}>*</span>
          </p>
          <div className="flex gap-2">
            {whatsappOpts.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setValue('contatavel_whatsapp', opt.value, { shouldValidate: true })}
                className="px-4 py-2 rounded font-montserrat text-xs font-semibold transition-all border"
                style={{
                  backgroundColor: wpAtual === opt.value ? '#5A1E2A' : 'white',
                  color:           wpAtual === opt.value ? 'white'   : '#6B6B6B',
                  borderColor:     wpAtual === opt.value ? '#5A1E2A' : '#E2D9C8',
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Observações */}
        <div className="md:col-span-2">
          <Field label="Observações">
            <Textarea {...register('observacoes')} placeholder="Informações adicionais sobre o devedor..." />
          </Field>
        </div>
      </div>

      {/* Navegação */}
      <div className="flex justify-between mt-8 pt-5" style={{ borderTop: '1px solid #E2D9C8' }}>
        <button type="button" onClick={onBack}
          className="px-7 py-2.5 rounded font-montserrat text-sm font-semibold transition-colors border"
          style={{ borderColor: '#5A1E2A', color: '#5A1E2A', backgroundColor: 'white' }}
          onMouseEnter={e => { Object.assign((e.currentTarget as HTMLButtonElement).style, { backgroundColor: '#5A1E2A', color: 'white' }) }}
          onMouseLeave={e => { Object.assign((e.currentTarget as HTMLButtonElement).style, { backgroundColor: 'white',   color: '#5A1E2A' }) }}>
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
