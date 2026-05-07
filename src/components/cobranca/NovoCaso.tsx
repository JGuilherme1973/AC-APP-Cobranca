/**
 * NovoCaso.tsx — Formulário multi-step de abertura de caso.
 *
 * Steps:
 *   1. Credor   → StepCreedor
 *   2. Devedor  → StepDevedor
 *   3. Título   → StepTitulo (prescrição + valor + upload)
 *   4. Estratégia → StepEstrategia (via processual + advogado + salvar)
 *
 * Ao salvar, redireciona para /cobranca/casos/:id
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, User, UserX, FileText, Scale } from 'lucide-react'
import StepCreedor   from './steps/StepCreedor'
import StepDevedor   from './steps/StepDevedor'
import StepTitulo    from './steps/StepTitulo'
import StepEstrategia from './steps/StepEstrategia'
import {
  useCriarCaso,
  type CredorFormData,
  type DevedorFormData,
  type TituloFormData,
  type EstrategiaFormData,
} from '@/hooks/cobranca/useCriarCaso'

// ── Configuração dos steps ────────────────────────────────────
const STEPS = [
  { label: 'Credor',     desc: 'Dados do cliente',       icon: User       },
  { label: 'Devedor',    desc: 'Dados do devedor',        icon: UserX      },
  { label: 'Título',     desc: 'Crédito e prescrição',   icon: FileText   },
  { label: 'Estratégia', desc: 'Via processual',          icon: Scale      },
] as const

// ── Barra de progresso ────────────────────────────────────────
function ProgressBar({ currentStep }: { currentStep: number }) {
  return (
    <div className="mb-8">
      {/* Desktop — horizontal */}
      <div className="hidden md:flex items-center">
        {STEPS.map((step, i) => {
          const done    = i < currentStep
          const active  = i === currentStep
          const Icon    = step.icon

          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              {/* Círculo do step */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center
                             transition-all duration-300 border-2"
                  style={{
                    backgroundColor: done    ? '#5A1E2A'
                                   : active  ? '#B89C5C'
                                   : 'white',
                    borderColor:     done    ? '#5A1E2A'
                                   : active  ? '#B89C5C'
                                   : '#E2D9C8',
                  }}
                >
                  {done ? (
                    <CheckCircle2 size={18} color="white" />
                  ) : (
                    <Icon size={16}
                      color={active ? '#0D1B2A' : '#C0C0C0'} />
                  )}
                </div>
                <div className="text-center">
                  <p
                    className="font-montserrat text-xs font-bold leading-tight"
                    style={{
                      color: done ? '#5A1E2A' : active ? '#B89C5C' : '#9B9B9B',
                    }}
                  >
                    {step.label}
                  </p>
                  <p className="font-lato text-[10px] leading-tight hidden lg:block"
                    style={{ color: '#9B9B9B' }}>
                    {step.desc}
                  </p>
                </div>
              </div>

              {/* Linha conectora */}
              {i < STEPS.length - 1 && (
                <div
                  className="flex-1 h-0.5 mx-3 mb-5 transition-all duration-300"
                  style={{ backgroundColor: i < currentStep ? '#5A1E2A' : '#E2D9C8' }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Mobile — resumo compacto */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-2">
          <p className="font-montserrat text-sm font-bold" style={{ color: '#5A1E2A' }}>
            {STEPS[currentStep].label}
          </p>
          <span className="font-montserrat text-xs" style={{ color: '#9B9B9B' }}>
            {currentStep + 1} de {STEPS.length}
          </span>
        </div>
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="flex-1 h-1.5 rounded-full transition-all duration-300"
              style={{
                backgroundColor:
                  i < currentStep  ? '#5A1E2A'
                : i === currentStep ? '#B89C5C'
                : '#E2D9C8',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────
interface WizardData {
  credor?:   CredorFormData
  devedor?:  DevedorFormData
  titulo?:   TituloFormData
  arquivos?: File[]
}

export default function NovoCaso() {
  const navigate = useNavigate()
  const { criarCaso, loading, error } = useCriarCaso()

  const [step, setStep]           = useState(0)
  const [dados, setDados]         = useState<WizardData>({})

  // Handlers de cada step
  const handleNextCreedor = (credor: CredorFormData) => {
    setDados(prev => ({ ...prev, credor }))
    setStep(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleNextDevedor = (devedor: DevedorFormData) => {
    setDados(prev => ({ ...prev, devedor }))
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleNextTitulo = (titulo: TituloFormData, arquivos: File[]) => {
    setDados(prev => ({ ...prev, titulo, arquivos }))
    setStep(3)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (estrategia: EstrategiaFormData) => {
    if (!dados.credor || !dados.devedor || !dados.titulo) return

    const casoId = await criarCaso({
      credor:    dados.credor,
      devedor:   dados.devedor,
      titulo:    { ...dados.titulo, arquivos: dados.arquivos },
      estrategia,
    })

    if (casoId) {
      navigate(`/cobranca/casos/${casoId}`)
    }
  }

  const handleBack = () => {
    setStep(prev => Math.max(0, prev - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Cabeçalho da página */}
      <div className="mb-6">
        <h1 className="font-cinzel text-2xl font-bold" style={{ color: '#5A1E2A' }}>
          Novo Caso
        </h1>
        <p className="font-lato text-sm mt-0.5" style={{ color: '#9B9B9B' }}>
          Preencha os dados para abertura do caso de cobrança.
        </p>
      </div>

      {/* Progress bar */}
      <ProgressBar currentStep={step} />

      {/* Card do formulário */}
      <div
        className="bg-white rounded-lg shadow-sm overflow-hidden"
        style={{ border: '1px solid #E2D9C8' }}
      >
        {/* Header do card */}
        <div
          className="px-6 py-4"
          style={{ backgroundColor: '#FAFAF8', borderBottom: '1px solid #E2D9C8' }}
        >
          <div className="flex items-center gap-3">
            {(() => {
              const Icon = STEPS[step].icon
              return (
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: '#5A1E2A' }}
                >
                  <Icon size={16} color="#B89C5C" />
                </div>
              )
            })()}
            <div>
              <h2 className="font-cinzel text-lg font-semibold" style={{ color: '#5A1E2A' }}>
                {STEPS[step].label}
              </h2>
              <p className="font-lato text-xs" style={{ color: '#9B9B9B' }}>
                {STEPS[step].desc}
              </p>
            </div>
          </div>
        </div>

        {/* Corpo — step atual */}
        <div className="px-6 py-6">
          {step === 0 && (
            <StepCreedor
              defaultValues={dados.credor}
              onNext={handleNextCreedor}
            />
          )}
          {step === 1 && (
            <StepDevedor
              defaultValues={dados.devedor}
              onNext={handleNextDevedor}
              onBack={handleBack}
            />
          )}
          {step === 2 && (
            <StepTitulo
              defaultValues={dados.titulo}
              arquivos={dados.arquivos}
              onNext={handleNextTitulo}
              onBack={handleBack}
            />
          )}
          {step === 3 && (
            <StepEstrategia
              submitting={loading}
              erro={error}
              onBack={handleBack}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </div>

      {/* Rodapé informativo */}
      <p
        className="mt-4 text-center font-lato text-xs"
        style={{ color: '#C0C0C0' }}
      >
        Todos os dados são armazenados com segurança no Supabase.
        CPF e CNPJ são criptografados em repouso.
      </p>
    </div>
  )
}
