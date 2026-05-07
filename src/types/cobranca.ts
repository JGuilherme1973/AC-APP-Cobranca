// ============================================================
// TIPOS PRINCIPAIS — AC-APP-Cobrança | ANDRADE & CINTRA
// ============================================================

export type TipoPessoa = 'PF' | 'PJ' | 'DESCONHECIDO'
export type PerfilRisco = 'baixo' | 'medio' | 'alto' | 'desconhecido'
export type ContatoWhatsApp = 'sim' | 'nao' | 'tentativa'
export type IndiceCorrecao = 'IPCA' | 'IGPM' | 'SELIC' | 'CONTRATUAL'
export type StatusPrescricao = 'VERDE' | 'AMARELO' | 'VERMELHO'
export type EtapaCaso =
  | 'DIAGNOSTICO'
  | 'ESTRATEGIA'
  | 'COBRANCA_EXTRAJUDICIAL'
  | 'ACAO_JUDICIAL'
  | 'EXECUCAO_RECUPERACAO'

export type ViaProcessual =
  | 'ACAO_COBRANCA'
  | 'ACAO_MONITORIA'
  | 'EXECUCAO_TITULO_EXTRAJUDICIAL'
  | 'CUMPRIMENTO_SENTENCA'
  | 'JEC'
  | 'NEGOCIACAO_EXTRAJUDICIAL'

export type StatusCaso =
  | 'ATIVO'
  | 'SUSPENSO'
  | 'ENCERRADO_EXITO'
  | 'ENCERRADO_SEM_EXITO'
  | 'PRESCRITO'

export type TipoTitulo =
  | 'CONTRATO_ASSINADO'
  | 'NOTA_PROMISSORIA'
  | 'CONFISSAO_DIVIDA'
  | 'CHEQUE'
  | 'DUPLICATA'
  | 'COMPROVANTE_PIX_TED_DOC'
  | 'PROVA_DIGITAL'
  | 'SENTENCA_JUDICIAL'
  | 'OUTRO'

export type RoleUsuario = 'ADMIN' | 'ADVOGADO' | 'ASSISTENTE' | 'CLIENTE'

export type CanalComunicacao = 'EMAIL' | 'WHATSAPP' | 'CARTORIO'
export type StatusEnvio = 'ENVIADO' | 'ENTREGUE' | 'ABERTO' | 'ERRO' | 'RECUSADO' | 'SEM_RETORNO'

export type PrioridadeTarefa = 'ALTA' | 'MEDIA' | 'BAIXA'
export type StatusTarefa = 'A_FAZER' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'BLOQUEADA'

export type TipoEvento =
  | 'ABERTURA_CASO'
  | 'COMUNICACAO_ENVIADA'
  | 'RESPOSTA_RECEBIDA'
  | 'PAGAMENTO_PARCIAL'
  | 'DISTRIBUICAO_ACAO'
  | 'DECISAO_JUDICIAL'
  | 'PENHORA_EFETIVADA'
  | 'ACORDO_FECHADO'
  | 'ENCERRAMENTO_CASO'
  | 'OUTRO'

export type TipoPagamento =
  | 'PAGAMENTO_DEVEDOR'
  | 'HONORARIOS_CLIENTE'
  | 'DESPESA_PROCESSUAL'
  | 'HONORARIOS_SUCUMBENCIA'

// ============================================================
// INTERFACES DE ENTIDADES
// ============================================================

export interface Credor {
  id: string
  tipo: TipoPessoa
  nome: string
  cpf_cnpj: string
  rg_inscricao_estadual?: string
  data_nascimento_fundacao?: string
  email: string
  whatsapp?: string
  telefone?: string
  cep: string
  endereco_completo: string
  cidade: string
  estado: string
  profissao?: string
  ramo_atividade?: string
  representante_legal?: {
    nome: string
    cpf: string
    cargo: string
  }
  observacoes?: string
  created_at: string
}

export interface Devedor {
  id: string
  tipo: TipoPessoa
  nome: string
  cpf_cnpj?: string
  perfil_risco: PerfilRisco
  enderecos: string[]
  telefones: string[]
  emails: string[]
  bens_conhecidos?: {
    imoveis?: string[]
    veiculos?: string[]
    contas_bancarias?: string[]
  }
  relacionamento_credor?: string
  advogado_devedor?: string
  contatavel_whatsapp: ContatoWhatsApp
  observacoes?: string
  created_at: string
}

export interface Titulo {
  id: string
  credor_id: string
  devedor_id: string
  tipo_titulo: TipoTitulo
  valor_original: number
  data_origem: string
  data_vencimento: string
  indice_correcao: IndiceCorrecao
  juros_mensais: number
  multa_percentual: number
  valor_atualizado: number
  prazo_prescricional_anos: 5 | 10
  data_inicio_prescricao: string
  data_limite_ajuizamento: string
  status_prescricao: StatusPrescricao
  interrupcao_prescricao_data?: string
  interrupcao_prescricao_motivo?: string
  observacoes_prova?: string
  created_at: string
}

export interface Caso {
  id: string
  titulo_id: string
  via_processual?: ViaProcessual
  etapa_atual: EtapaCaso
  advogado_id: string
  numero_processo?: string
  tribunal?: string
  vara?: string
  link_tribunal?: string
  status: StatusCaso
  data_abertura: string
  data_encerramento?: string
  sisbajud_resultado?: string
  sisbajud_data?: string
  renajud_resultado?: string
  renajud_data?: string
  infojud_resultado?: string
  infojud_data?: string
  created_at: string
  credor?: Credor
  devedor?: Devedor
  titulo?: Titulo
  advogado?: Usuario
}

export interface Comunicacao {
  id: string
  caso_id: string
  canal: CanalComunicacao
  tipo_template: string
  destinatario: string
  status_envio: StatusEnvio
  data_envio: string
  conteudo: string
  protocolo_cartorial?: string
  created_at: string
}

export interface Tarefa {
  id: string
  caso_id: string
  descricao: string
  responsavel_id: string
  prazo: string
  prioridade: PrioridadeTarefa
  status: StatusTarefa
  created_at: string
  responsavel?: Usuario
}

export interface EventoTimeline {
  id: string
  caso_id: string
  tipo_evento: TipoEvento
  descricao: string
  data_evento: string
  usuario_id: string
  created_at: string
  usuario?: Usuario
}

export interface Pagamento {
  id: string
  caso_id: string
  valor: number
  data_pagamento: string
  tipo: TipoPagamento
  observacao?: string
  created_at: string
}

export interface Documento {
  id: string
  caso_id: string
  nome_arquivo: string
  url_storage: string
  tipo_documento: string
  status: 'ATIVO' | 'REVOGADO'
  data_upload: string
  created_at: string
}

export interface Usuario {
  id: string
  nome: string
  email: string
  role: RoleUsuario
  oab?: string
  ativo: boolean
  created_at: string
}

// ============================================================
// TIPOS AUXILIARES PARA FORMULÁRIOS
// ============================================================

export interface AlertaPrescricao {
  caso_id: string
  titulo_id: string
  credor_nome: string
  devedor_nome: string
  valor_atualizado: number
  data_limite: string
  dias_restantes: number
  status: StatusPrescricao
}

export interface MetricasDashboard {
  total_casos_ativos: number
  valor_total_cobranca: number
  valor_recuperado_mes: number
  valor_recuperado_total: number
  taxa_sucesso_extrajudicial: number
  taxa_sucesso_judicial: number
  casos_prescricao_90_dias: AlertaPrescricao[]
  tarefas_vencidas: number
  tarefas_hoje: number
  tarefas_proximos_7_dias: number
  casos_por_etapa: Record<EtapaCaso, number>
}
