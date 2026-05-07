/**
 * StepCreedor — Step 1 do formulário multi-step de Novo Caso.
 * Cadastro do Credor (cliente do escritório): PF ou PJ.
 */

import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, AlertCircle } from 'lucide-react'
import { buscarCEP } from '@/lib/viacep'
import { validarCPF, validarCNPJ, mascaraCPF, mascaraCNPJ, mascaraCEP, mascaraTelefone } from '@/lib/validators'
import type { CredorFormData } from '@/hooks/cobranca/useCriarCaso'

// ── Schema de validação ───────────────────────────────────────
const schema = z
  .object({
    tipo:                      z.enum(['PF', 'PJ']),
    nome:                      z.string().min(3, 'Nome obrigatório (mín. 3 caracteres)'),
    cpf_cnpj:                  z.string().min(11, 'CPF/CNPJ obrigatório'),
    rg_inscricao_estadual:     z.string().optional(),
    data_nascimento_fundacao:  z.string().optional(),
    email:                     z.string().email('E-mail inválido').or(z.literal('')).optional(),
    whatsapp:                  z.string().optional(),
    telefone:                  z.string().optional(),
    cep:                       z.string().min(9, 'CEP obrigatório'),
    logradouro:                z.string().min(3, 'Logradouro obrigatório'),
    numero:                    z.string().min(1, 'Número obrigatório'),
    complemento:               z.string().optional(),
    bairro:                    z.string().min(2, 'Bairro obrigatório'),
    cidade:                    z.string().min(2, 'Cidade obrigatória'),
    estado:                    z.string().length(2, 'UF obrigatória'),
    profissao:                 z.string().optional(),
    ramo_atividade:            z.string().optional(),
    representante_legal_nome:  z.string().optional(),
    representante_legal_cpf:   z.string().optional(),
    representante_legal_cargo: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const nums = data.cpf_cnpj.replace(/\D/g, '')
    if (data.tipo === 'PF' && !validarCPF(nums)) {
      ctx.addIssue({ code: 'custom', message: 'CPF inválido', path: ['cpf_cnpj'] })
    }
    if (data.tipo === 'PJ' && !validarCNPJ(nums)) {
      ctx.addIssue({ code: 'custom', message: 'CNPJ inválido', path: ['cpf_cnpj'] })
    }
    if (data.tipo === 'PJ') {
      if (!data.representante_legal_nome?.trim()) {
        ctx.addIssue({ code: 'custom', message: 'Nome do representante obrigatório', path: ['representante_legal_nome'] })
      }
      if (!data.representante_legal_cpf?.trim() || !validarCPF(data.representante_legal_cpf)) {
        ctx.addIssue({ code: 'custom', message: 'CPF do representante inválido', path: ['representante_legal_cpf'] })
      }
      if (!data.representante_legal_cargo?.trim()) {
        ctx.addIssue({ code: 'custom', message: 'Cargo obrigatório', path: ['representante_legal_cargo'] })
      }
    }
  })

type FormData = z.infer<typeof schema>

// ── Componentes de UI ─────────────────────────────────────────
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

function Input({
  error, className = '', ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <input
      {...props}
      className={`w-full border rounded px-3 py-2.5 text-sm font-lato bg-white
        focus:outline-none focus:ring-2 focus:ring-[#5A1E2A] transition-colors
        disabled:bg-gray-50 disabled:cursor-not-allowed ${className}`}
      style={{ borderColor: error ? '#FECACA' : '#E2D9C8', color: '#1A1A1A' }}
    />
  )
}

// ── Step 1 ────────────────────────────────────────────────────
interface Props {
  defaultValues?: Partial<CredorFormData>
  onNext: (data: CredorFormData) => void
}

export default function StepCreedor({ defaultValues, onNext }: Props) {
  const [cepLoading, setCepLoading] = useState(false)
  const [cepErro, setCepErro]       = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo:    'PF',
      estado:  '',
      ...defaultValues,
    },
  })

  const tipo = watch('tipo')

  // ── Busca automática de CEP ───────────────────────────────
  const handleCEPBlur = useCallback(
    async (e: React.FocusEvent<HTMLInputElement>) => {
      const cep = e.target.value
      if (cep.replace(/\D/g, '').length !== 8) return
      setCepLoading(true)
      setCepErro(false)
      const endereco = await buscarCEP(cep)
      if (endereco) {
        setValue('logradouro', endereco.logradouro, { shouldValidate: true })
        setValue('bairro',     endereco.bairro,     { shouldValidate: true })
        setValue('cidade',     endereco.localidade, { shouldValidate: true })
        setValue('estado',     endereco.uf,         { shouldValidate: true })
        if (endereco.complemento) setValue('complemento', endereco.complemento)
      } else {
        setCepErro(true)
      }
      setCepLoading(false)
    },
    [setValue],
  )

  return (
    <form onSubmit={handleSubmit(data => onNext(data as CredorFormData))} noValidate>

      {/* Tipo PF / PJ */}
      <div className="mb-6">
        <p className="font-montserrat text-xs font-semibold uppercase tracking-wide mb-2"
          style={{ color: '#1A1A1A' }}>
          Tipo de pessoa <span style={{ color: '#5A1E2A' }}>*</span>
        </p>
        <div className="flex gap-2">
          {(['PF', 'PJ'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setValue('tipo', t, { shouldValidate: true })}
              className="px-5 py-2 rounded font-montserrat text-sm font-semibold transition-all border"
              style={{
                backgroundColor: tipo === t ? '#5A1E2A' : 'white',
                color:           tipo === t ? 'white'   : '#6B6B6B',
                borderColor:     tipo === t ? '#5A1E2A' : '#E2D9C8',
              }}
            >
              {t === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de campos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Nome */}
        <div className="md:col-span-2">
          <Field label={tipo === 'PF' ? 'Nome Completo' : 'Razão Social'} error={errors.nome?.message} required>
            <Input {...register('nome')} placeholder="Nome completo" error={errors.nome?.message} />
          </Field>
        </div>

        {/* CPF / CNPJ */}
        <Field label={tipo === 'PF' ? 'CPF' : 'CNPJ'} error={errors.cpf_cnpj?.message} required>
          <Input
            {...register('cpf_cnpj')}
            placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
            error={errors.cpf_cnpj?.message}
            onChange={e => {
              const masked = tipo === 'PF' ? mascaraCPF(e.target.value) : mascaraCNPJ(e.target.value)
              setValue('cpf_cnpj', masked, { shouldValidate: false })
            }}
          />
        </Field>

        {/* RG / IE */}
        <Field label={tipo === 'PF' ? 'RG' : 'Inscrição Estadual'} error={errors.rg_inscricao_estadual?.message}>
          <Input {...register('rg_inscricao_estadual')} placeholder={tipo === 'PF' ? '00.000.000-0' : '000.000.000.000'} />
        </Field>

        {/* Data nasc / fundação */}
        <Field label={tipo === 'PF' ? 'Data de Nascimento' : 'Data de Fundação'} error={errors.data_nascimento_fundacao?.message}>
          <Input {...register('data_nascimento_fundacao')} type="date" />
        </Field>

        {/* E-mail */}
        <Field label="E-mail" error={errors.email?.message}>
          <Input {...register('email')} type="email" placeholder="email@exemplo.com.br" />
        </Field>

        {/* WhatsApp */}
        <Field label="WhatsApp" error={errors.whatsapp?.message}>
          <Input
            {...register('whatsapp')}
            placeholder="(11) 99999-9999"
            onChange={e => setValue('whatsapp', mascaraTelefone(e.target.value))}
          />
        </Field>

        {/* Telefone */}
        <Field label="Telefone" error={errors.telefone?.message}>
          <Input
            {...register('telefone')}
            placeholder="(11) 4444-4444"
            onChange={e => setValue('telefone', mascaraTelefone(e.target.value))}
          />
        </Field>

        {/* Profissão / Ramo */}
        <Field label={tipo === 'PF' ? 'Profissão' : 'Ramo de Atividade'} error={errors.profissao?.message}>
          <Input
            {...register(tipo === 'PF' ? 'profissao' : 'ramo_atividade')}
            placeholder={tipo === 'PF' ? 'ex: Empresário' : 'ex: Comércio varejista'}
          />
        </Field>
      </div>

      {/* Endereço */}
      <div className="mt-6 pt-5" style={{ borderTop: '1px solid #E2D9C8' }}>
        <p className="font-montserrat text-xs font-semibold uppercase tracking-widest mb-4"
          style={{ color: '#9B9B9B' }}>
          Endereço
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* CEP */}
          <Field label="CEP" error={errors.cep?.message ?? (cepErro ? 'CEP não encontrado' : undefined)} required>
            <div className="relative">
              <Input
                {...register('cep')}
                placeholder="00000-000"
                error={errors.cep?.message}
                onChange={e => setValue('cep', mascaraCEP(e.target.value))}
                onBlur={handleCEPBlur}
              />
              {cepLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Search size={14} className="animate-pulse" style={{ color: '#B89C5C' }} />
                </div>
              )}
            </div>
          </Field>

          {/* Logradouro */}
          <div className="md:col-span-2">
            <Field label="Logradouro" error={errors.logradouro?.message} required>
              <Input {...register('logradouro')} placeholder="Rua, Avenida..." error={errors.logradouro?.message} />
            </Field>
          </div>

          {/* Número */}
          <Field label="Número" error={errors.numero?.message} required>
            <Input {...register('numero')} placeholder="123" error={errors.numero?.message} />
          </Field>

          {/* Complemento */}
          <Field label="Complemento" error={errors.complemento?.message}>
            <Input {...register('complemento')} placeholder="Apto, sala..." />
          </Field>

          {/* Bairro */}
          <Field label="Bairro" error={errors.bairro?.message} required>
            <Input {...register('bairro')} placeholder="Bairro" error={errors.bairro?.message} />
          </Field>

          {/* Cidade */}
          <div className="md:col-span-2">
            <Field label="Cidade" error={errors.cidade?.message} required>
              <Input {...register('cidade')} placeholder="Cidade" error={errors.cidade?.message} />
            </Field>
          </div>

          {/* UF */}
          <Field label="UF" error={errors.estado?.message} required>
            <Input {...register('estado')} placeholder="SP" maxLength={2}
              onChange={e => setValue('estado', e.target.value.toUpperCase())}
              error={errors.estado?.message} />
          </Field>
        </div>
      </div>

      {/* Representante Legal (apenas PJ) */}
      {tipo === 'PJ' && (
        <div className="mt-6 pt-5" style={{ borderTop: '1px solid #E2D9C8' }}>
          <p className="font-montserrat text-xs font-semibold uppercase tracking-widest mb-4"
            style={{ color: '#9B9B9B' }}>
            Representante Legal
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Field label="Nome do Representante" error={errors.representante_legal_nome?.message} required>
                <Input {...register('representante_legal_nome')}
                  placeholder="Nome completo"
                  error={errors.representante_legal_nome?.message} />
              </Field>
            </div>
            <Field label="CPF do Representante" error={errors.representante_legal_cpf?.message} required>
              <Input
                {...register('representante_legal_cpf')}
                placeholder="000.000.000-00"
                error={errors.representante_legal_cpf?.message}
                onChange={e => setValue('representante_legal_cpf', mascaraCPF(e.target.value))}
              />
            </Field>
            <Field label="Cargo / Função" error={errors.representante_legal_cargo?.message} required>
              <Input {...register('representante_legal_cargo')}
                placeholder="ex: Sócio-Administrador"
                error={errors.representante_legal_cargo?.message} />
            </Field>
          </div>
        </div>
      )}

      {/* Botão Próximo */}
      <div className="flex justify-end mt-8 pt-5" style={{ borderTop: '1px solid #E2D9C8' }}>
        <button
          type="submit"
          className="px-8 py-2.5 rounded font-montserrat text-sm font-semibold text-white
                     transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{ backgroundColor: '#5A1E2A', '--tw-ring-color': '#5A1E2A' } as React.CSSProperties}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B89C5C' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#5A1E2A' }}
        >
          Próximo →
        </button>
      </div>
    </form>
  )
}
