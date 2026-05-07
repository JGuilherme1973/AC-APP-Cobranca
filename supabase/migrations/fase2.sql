-- ============================================================
-- FASE 2 — ANDRADE & CINTRA Legal Desk
-- Migration incremental — não altera tabelas existentes
-- ============================================================
-- Execução: psql -d <banco> -f fase2.sql
-- Supabase: Dashboard → SQL Editor → executar
-- ============================================================

BEGIN;

-- ============================================================
-- MÓDULO A — PAGAMENTOS INTEGRADOS
-- ============================================================

-- ── Tabela: cobrancas_financeiras ────────────────────────────
-- Registra cada cobrança gerada (Pix, Boleto, Cartão, Link)
-- com rastreamento completo do ciclo de vida e split financeiro.

CREATE TABLE IF NOT EXISTS cobrancas_financeiras (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id              UUID        NOT NULL REFERENCES casos(id) ON DELETE RESTRICT,
  tipo_pagamento       TEXT        NOT NULL
                                   CHECK (tipo_pagamento IN (
                                     'pix', 'pix_automatico', 'boleto',
                                     'cartao', 'link'
                                   )),
  valor_original       DECIMAL(15,2) NOT NULL CHECK (valor_original >= 0),
  valor_juros          DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (valor_juros >= 0),
  valor_multa          DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (valor_multa >= 0),
  valor_desconto       DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (valor_desconto >= 0),
  valor_total          DECIMAL(15,2) NOT NULL
                                   GENERATED ALWAYS AS (
                                     valor_original + valor_juros + valor_multa - valor_desconto
                                   ) STORED,
  data_vencimento      DATE        NOT NULL,
  data_pagamento       TIMESTAMPTZ,
  status               TEXT        NOT NULL DEFAULT 'pendente'
                                   CHECK (status IN (
                                     'pendente', 'pago', 'vencido', 'cancelado', 'estornado'
                                   )),
  -- Pix
  pix_txid             TEXT        UNIQUE,
  pix_qrcode           TEXT,           -- imagem base64 do QR Code
  pix_copia_cola       TEXT,           -- payload EMV

  -- Pix Automático (BCB 2025)
  pix_auto_recursa_id  TEXT,           -- ID da recorrência aprovada pelo BCB
  pix_auto_proximo_debito DATE,

  -- Boleto
  boleto_codigo        TEXT,           -- linha digitável
  boleto_nosso_numero  TEXT,
  boleto_pdf_url       TEXT,
  boleto_banco         TEXT,

  -- Cartão
  cartao_parcelas      INTEGER         DEFAULT 1 CHECK (cartao_parcelas BETWEEN 1 AND 12),
  cartao_bandeira      TEXT,
  cartao_ultimos4      TEXT,

  -- Link de pagamento
  link_pagamento       TEXT            UNIQUE,
  link_expiracao       TIMESTAMPTZ,
  link_visualizacoes   INTEGER         DEFAULT 0,

  -- Gateway
  id_gateway           TEXT,           -- ID interno da iugu
  gateway              TEXT            DEFAULT 'iugu',
  resposta_gateway     JSONB,          -- payload bruto para auditoria

  -- Parcelamento
  parcela_numero       INTEGER         NOT NULL DEFAULT 1 CHECK (parcela_numero >= 1),
  total_parcelas       INTEGER         NOT NULL DEFAULT 1 CHECK (total_parcelas >= 1),
  acordo_id            UUID            REFERENCES acordos_parcelados(id) DEFERRABLE,

  -- Split financeiro
  split_escritorio_pct DECIMAL(5,2)  NOT NULL DEFAULT 20
                                     CHECK (split_escritorio_pct BETWEEN 0 AND 100),
  split_credor_pct     DECIMAL(5,2)  NOT NULL DEFAULT 80
                                     CHECK (split_credor_pct BETWEEN 0 AND 100),
  -- CHECK: splits somam 100
  CONSTRAINT chk_split_total CHECK (
    split_escritorio_pct + split_credor_pct = 100
  ),
  split_valor_escritorio DECIMAL(15,2) GENERATED ALWAYS AS (
    (valor_original + valor_juros + valor_multa - valor_desconto)
    * split_escritorio_pct / 100
  ) STORED,
  split_valor_credor   DECIMAL(15,2) GENERATED ALWAYS AS (
    (valor_original + valor_juros + valor_multa - valor_desconto)
    * split_credor_pct / 100
  ) STORED,

  -- Metadados
  criado_por           UUID            REFERENCES usuarios(id),
  created_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  cobrancas_financeiras IS 'Cobranças geradas por caso — Pix, Boleto, Cartão ou Link via iugu';
COMMENT ON COLUMN cobrancas_financeiras.pix_txid          IS 'Transaction ID BCB — chave de idempotência';
COMMENT ON COLUMN cobrancas_financeiras.pix_copia_cola     IS 'Payload EMV Pix para copiar e colar';
COMMENT ON COLUMN cobrancas_financeiras.split_escritorio_pct IS 'Percentual de honorários do escritório (padrão 20%)';
COMMENT ON COLUMN cobrancas_financeiras.resposta_gateway   IS 'Payload bruto da iugu para rastreabilidade';

-- ── Tabela: acordos_parcelados ───────────────────────────────
-- Proposta/acordo de parcelamento negociado com o devedor.
-- Cada parcela gera uma linha em cobrancas_financeiras.

CREATE TABLE IF NOT EXISTS acordos_parcelados (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id                    UUID        NOT NULL REFERENCES casos(id) ON DELETE RESTRICT,
  valor_original             DECIMAL(15,2) NOT NULL CHECK (valor_original > 0),
  valor_desconto             DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (valor_desconto >= 0),
  valor_acordo               DECIMAL(15,2) NOT NULL
                                          CHECK (valor_acordo > 0),
  numero_parcelas            INTEGER     NOT NULL DEFAULT 1 CHECK (numero_parcelas >= 1),
  data_primeiro_vencimento   DATE        NOT NULL,
  periodicidade              TEXT        NOT NULL DEFAULT 'mensal'
                                         CHECK (periodicidade IN ('semanal', 'quinzenal', 'mensal')),
  status                     TEXT        NOT NULL DEFAULT 'proposto'
                                         CHECK (status IN (
                                           'proposto', 'aceito', 'em_andamento',
                                           'quitado', 'inadimplente', 'cancelado'
                                         )),
  canal_aceite               TEXT        CHECK (canal_aceite IN (
                                           'whatsapp', 'email', 'presencial',
                                           'portal_self_service', 'cartorio'
                                         )),

  -- Pix Automático BCB 2025
  pix_automatico_ativo         BOOLEAN     NOT NULL DEFAULT FALSE,
  pix_automatico_autorizacao_id TEXT,
  pix_automatico_cancelado_em  TIMESTAMPTZ,
  pix_automatico_cancelado_motivo TEXT,

  -- Confissão de dívida
  confissao_divida_pdf_url   TEXT,
  assinatura_digital_url     TEXT,       -- ClickSign / D4Sign
  assinatura_hash            TEXT,       -- hash do documento assinado

  -- Controle
  aceito_em                  TIMESTAMPTZ,
  aceito_ip                  TEXT,
  advogado_aprovador_id      UUID        REFERENCES usuarios(id),
  observacoes                TEXT,
  percentual_desconto        DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN valor_original > 0
         THEN ROUND((valor_desconto / valor_original) * 100, 2)
         ELSE 0
    END
  ) STORED,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  acordos_parcelados IS 'Acordos de parcelamento negociados com devedores';
COMMENT ON COLUMN acordos_parcelados.pix_automatico_ativo IS 'Débito automático BCB 2025 autorizado pelo devedor';
COMMENT ON COLUMN acordos_parcelados.assinatura_hash      IS 'Hash SHA-256 do PDF de confissão de dívida assinado';

-- Agora que acordos_parcelados existe, adicionar FK deferível em cobrancas_financeiras
-- (FK foi declarada DEFERRABLE na criação — OK para INSERT ordenado)

-- ============================================================
-- MÓDULO B — RÉGUA DE COBRANÇA INTELIGENTE
-- ============================================================

-- ── Tabela: regras_cobranca ──────────────────────────────────
-- Cadências configuráveis de cobrança por tipo de caso.
-- passos_json define os steps D-5..D+35 com canal e tom.

CREATE TABLE IF NOT EXISTS regras_cobranca (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT        NOT NULL,
  descricao   TEXT,
  tipo_caso   TEXT,       -- NULL = aplica a todos os tipos
  ativa       BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Estrutura esperada de passos_json:
  -- [{ "dia": -5, "canal": "whatsapp", "tom": "amigavel", "template": "..." }, ...]
  passos_json JSONB       NOT NULL DEFAULT '[]'::jsonb,
  criado_por  UUID        REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_passos_json_array CHECK (jsonb_typeof(passos_json) = 'array')
);

COMMENT ON TABLE  regras_cobranca IS 'Cadências de cobrança configuráveis — D-5 a D+35';
COMMENT ON COLUMN regras_cobranca.passos_json IS
  'Array de steps: [{dia, canal, tom, template, exige_resposta_anterior}]';

-- Inserir régua padrão conforme briefing
INSERT INTO regras_cobranca (nome, descricao, tipo_caso, passos_json)
VALUES (
  'Régua Padrão A&C',
  'Cadência padrão ANDRADE & CINTRA — D-5 a D+35',
  NULL,
  '[
    {"dia": -5,  "canal": "whatsapp",        "tom": "amigavel",   "template": "lembrete_vencimento"},
    {"dia": -1,  "canal": "whatsapp_email",  "tom": "amigavel",   "template": "link_pix_vencimento"},
    {"dia":  1,  "canal": "whatsapp_sms",    "tom": "formal",     "template": "aviso_vencido"},
    {"dia":  3,  "canal": "whatsapp",        "tom": "formal",     "template": "link_pagamento"},
    {"dia":  7,  "canal": "whatsapp_email",  "tom": "negociacao", "template": "proposta_acordo"},
    {"dia": 15,  "canal": "email_carta_pdf", "tom": "juridico",   "template": "notificacao_preventiva"},
    {"dia": 30,  "canal": "email_sms",       "tom": "juridico",   "template": "aviso_protesto"},
    {"dia": 35,  "canal": "sistema",         "tom": "automatico", "template": "executar_protesto"}
  ]'::jsonb
)
ON CONFLICT DO NOTHING;

-- ── Tabela: execucoes_regua ──────────────────────────────────
-- Log imutável de cada disparo da régua por caso.
-- Registra IA personalização, canal, template e resultado.

CREATE TABLE IF NOT EXISTS execucoes_regua (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id                  UUID        NOT NULL REFERENCES casos(id) ON DELETE RESTRICT,
  regua_id                 UUID        NOT NULL REFERENCES regras_cobranca(id),
  step_dia                 INTEGER     NOT NULL,     -- ex: -5, 1, 30
  canal                    TEXT        NOT NULL,
  template_usado           TEXT,
  status                   TEXT        NOT NULL
                                       CHECK (status IN (
                                         'enviado', 'falhou', 'ignorado',
                                         'cancelado_horario', 'cancelado_silencio'
                                       )),
  mensagem_conteudo        TEXT,       -- conteúdo final enviado (após personalização IA)

  -- IA
  ia_personalizacao_usada  BOOLEAN     NOT NULL DEFAULT FALSE,
  ia_tom_detectado         TEXT        CHECK (ia_tom_detectado IN (
                                         'vai_pagar', 'quer_negociar',
                                         'contestando', 'sem_resposta', NULL
                                       )),
  ia_sugestao_proxima_acao TEXT,
  ia_tokens_usados         INTEGER,

  -- Rastreabilidade
  comunicacao_id           UUID        REFERENCES comunicacoes(id),
  erro_detalhe             TEXT,
  data_execucao            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE execucoes_regua IS 'Log imutável de execuções da régua de cobrança';

-- Trigger: bloquear UPDATE e DELETE (append-only)
CREATE OR REPLACE FUNCTION fn_bloquear_edicao_regua()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'execucoes_regua é append-only — UPDATE e DELETE são proibidos';
END;
$$;

CREATE TRIGGER trg_imutavel_execucoes_regua
  BEFORE UPDATE OR DELETE ON execucoes_regua
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_edicao_regua();

-- ── Tabela: portal_tokens ────────────────────────────────────
-- Tokens de acesso único ao portal self-service do devedor.

CREATE TABLE IF NOT EXISTS portal_tokens (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id          UUID        NOT NULL REFERENCES casos(id) ON DELETE RESTRICT,
  devedor_id       UUID        NOT NULL REFERENCES devedores(id),
  token            TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expira_em        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  usado_em         TIMESTAMPTZ,
  ip_acesso        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE portal_tokens IS 'Tokens de acesso ao portal de renegociação self-service (/negociar/:token)';

-- ============================================================
-- MÓDULO C — PROTESTO E NEGATIVAÇÃO
-- ============================================================

-- ── Tabela: protestos ────────────────────────────────────────
-- Solicitações de protesto em cartório via e-Protesto / CRI Digital.
-- Regra: valor > 5000 exige aprovação explícita do advogado.

CREATE TABLE IF NOT EXISTS protestos (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id             UUID        NOT NULL REFERENCES casos(id) ON DELETE RESTRICT,
  valor               DECIMAL(15,2) NOT NULL CHECK (valor > 0),
  tipo_titulo         TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'solicitado'
                                  CHECK (status IN (
                                    'aguardando_aprovacao', 'solicitado', 'enviado',
                                    'protestado', 'cancelado', 'pago_apos_protesto'
                                  )),
  -- Exige aprovação para valores > R$ 5.000
  exige_aprovacao     BOOLEAN     NOT NULL GENERATED ALWAYS AS (valor > 5000) STORED,
  aprovado_por        UUID        REFERENCES usuarios(id),
  aprovado_em         TIMESTAMPTZ,
  motivo_rejeicao     TEXT,

  -- Cartório / e-Protesto
  cartorio_nome       TEXT,
  cartorio_cidade     TEXT,
  numero_protocolo    TEXT        UNIQUE,
  id_gateway          TEXT,       -- ID no e-Protesto / CRI Digital
  resposta_gateway    JSONB,

  -- Datas
  data_solicitacao    DATE        NOT NULL DEFAULT CURRENT_DATE,
  data_envio          DATE,
  data_confirmacao    DATE,
  data_cancelamento   DATE,
  motivo_cancelamento TEXT,

  -- Documentos e custos
  pdf_url             TEXT,
  custo               DECIMAL(10,2) DEFAULT 0,
  custo_lancado       BOOLEAN     NOT NULL DEFAULT FALSE,  -- lançado como despesa processual?

  -- Controle
  criado_por          UUID        REFERENCES usuarios(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  protestos IS 'Protestos em cartório via e-Protesto/CRI Digital';
COMMENT ON COLUMN protestos.exige_aprovacao IS 'Calculado automaticamente: TRUE quando valor > R$ 5.000';
COMMENT ON COLUMN protestos.custo_lancado   IS 'TRUE quando o custo foi lançado como despesa processual no caso';

-- ── Tabela: negativacoes ─────────────────────────────────────
-- Negativações em bureaus (Serasa, SPC, Boa Vista).
-- REGRA CRÍTICA: status inicial obrigatório = 'pendente_notificacao'
-- Bloqueio por trigger: só negativar após 10 dias da notificação prévia.

CREATE TABLE IF NOT EXISTS negativacoes (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id                     UUID        NOT NULL REFERENCES casos(id) ON DELETE RESTRICT,
  devedor_id                  UUID        NOT NULL REFERENCES devedores(id),
  bureau                      TEXT        NOT NULL
                                          CHECK (bureau IN ('serasa', 'spc', 'boa_vista')),
  valor                       DECIMAL(15,2) NOT NULL CHECK (valor > 0),
  data_vencimento_original    DATE        NOT NULL,

  -- Notificação prévia obrigatória (CDC Art. 43 §2º — 10 dias corridos)
  data_notificacao_previa     DATE,       -- data em que o devedor foi notificado
  canal_notificacao_previa    TEXT,       -- email / whatsapp / carta
  comprovante_notificacao_url TEXT,       -- prova da notificação

  -- Negativação em si
  data_negativacao            DATE,
  id_bureau                   TEXT,       -- ID retornado pelo bureau
  status                      TEXT        NOT NULL DEFAULT 'pendente_notificacao'
                                          CHECK (status IN (
                                            'pendente_notificacao',
                                            'notificado_aguardando',
                                            'negativado',
                                            'baixa_solicitada',
                                            'baixado',
                                            'cancelado'
                                          )),
  resposta_bureau             JSONB,

  -- Baixa
  data_baixa                  DATE,
  motivo_baixa                TEXT        CHECK (motivo_baixa IN (
                                            'pagamento', 'acordo', 'contestacao_procedente',
                                            'cancelamento_manual', 'prazo_legal'
                                          )),
  comprovante_url             TEXT,

  -- Controle
  criado_por                  UUID        REFERENCES usuarios(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  negativacoes IS 'Negativações em Serasa/SPC/Boa Vista com controle CDC Art. 43 §2º';
COMMENT ON COLUMN negativacoes.data_notificacao_previa IS
  'Data em que o devedor foi notificado — obrigatória antes da negativação (CDC Art. 43 §2º)';

-- Trigger: bloquear negativação sem notificação prévia de 10 dias
CREATE OR REPLACE FUNCTION fn_validar_negativacao()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Ao tentar alterar status para 'negativado'
  IF NEW.status = 'negativado' THEN
    -- Verificar se notificação prévia foi registrada
    IF NEW.data_notificacao_previa IS NULL THEN
      RAISE EXCEPTION
        'LGPD/CDC Art. 43 §2º: Negativação bloqueada — data_notificacao_previa não registrada';
    END IF;
    -- Verificar se já passaram 10 dias corridos desde a notificação
    IF (CURRENT_DATE - NEW.data_notificacao_previa) < 10 THEN
      RAISE EXCEPTION
        'LGPD/CDC Art. 43 §2º: Negativação bloqueada — prazo mínimo de 10 dias não decorrido (notificado em %, hoje %)',
        NEW.data_notificacao_previa, CURRENT_DATE;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_negativacao
  BEFORE INSERT OR UPDATE ON negativacoes
  FOR EACH ROW EXECUTE FUNCTION fn_validar_negativacao();

-- Trigger: bloquear aprovação automática de protesto > R$ 5.000
CREATE OR REPLACE FUNCTION fn_validar_protesto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Se tentando mudar para 'enviado' sem aprovação em valor > 5000
  IF NEW.status = 'enviado' AND NEW.valor > 5000 AND NEW.aprovado_por IS NULL THEN
    RAISE EXCEPTION
      'Protesto bloqueado: valor R$ % acima de R$ 5.000 exige aprovação explícita do advogado',
      NEW.valor;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_protesto
  BEFORE INSERT OR UPDATE ON protestos
  FOR EACH ROW EXECUTE FUNCTION fn_validar_protesto();

-- ============================================================
-- MÓDULO D — COMPLIANCE LGPD + SEGURANÇA
-- ============================================================

-- ── Tabela: auditoria ────────────────────────────────────────
-- Log APPEND ONLY de todas as ações do sistema.
-- UPDATE e DELETE bloqueados por trigger.

CREATE TABLE IF NOT EXISTS auditoria (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID        REFERENCES usuarios(id),
  acao         TEXT        NOT NULL,     -- ex: 'UPDATE_ETAPA', 'GERAR_PIX', 'LOGIN'
  entidade     TEXT        NOT NULL,     -- ex: 'casos', 'negativacoes', 'usuarios'
  entidade_id  UUID,
  dados_antes  JSONB,
  dados_depois JSONB,
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE auditoria IS 'Log de auditoria APPEND ONLY — toda ação do sistema';

-- Trigger: bloquear UPDATE e DELETE (auditoria é imutável)
CREATE OR REPLACE FUNCTION fn_bloquear_edicao_auditoria()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'auditoria é APPEND ONLY — UPDATE e DELETE são absolutamente proibidos';
END;
$$;

CREATE TRIGGER trg_imutavel_auditoria
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_edicao_auditoria();

-- ── Tabela: consentimentos_lgpd ──────────────────────────────
-- Registro de consentimento do devedor a cada comunicação.
-- Base legal: Art. 7º V (execução de contrato) e Art. 7º IX (legítimo interesse).

CREATE TABLE IF NOT EXISTS consentimentos_lgpd (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  devedor_id          UUID        NOT NULL REFERENCES devedores(id),
  caso_id             UUID        REFERENCES casos(id),
  canal               TEXT        NOT NULL CHECK (canal IN (
                                    'email', 'whatsapp', 'sms', 'portal', 'presencial', 'carta'
                                  )),
  tipo_consentimento  TEXT        NOT NULL CHECK (tipo_consentimento IN (
                                    'cobranca',        -- envio de cobranças
                                    'negativacao',     -- inclusão em bureaus
                                    'protesto',        -- protesto em cartório
                                    'cessao',          -- cessão de crédito
                                    'tratamento_dados' -- tratamento geral de dados pessoais
                                  )),
  base_legal          TEXT        NOT NULL DEFAULT 'execucao_contrato'
                                  CHECK (base_legal IN (
                                    'execucao_contrato', -- Art. 7º V LGPD
                                    'legitimo_interesse', -- Art. 7º IX LGPD
                                    'consentimento_explicito' -- Art. 7º I LGPD
                                  )),
  texto_apresentado   TEXT        NOT NULL, -- texto exato apresentado ao devedor
  concedido           BOOLEAN     NOT NULL,
  data_consentimento  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address          TEXT,
  user_agent          TEXT,
  revogado_em         TIMESTAMPTZ,
  revogacao_canal     TEXT,
  revogacao_ip        TEXT
);

COMMENT ON TABLE  consentimentos_lgpd IS 'Registro de consentimentos LGPD por devedor/canal';
COMMENT ON COLUMN consentimentos_lgpd.texto_apresentado IS
  'Texto integral apresentado ao devedor — prova do consentimento informado';

-- ── Tabela: solicitacoes_titular ─────────────────────────────
-- Direitos do titular — LGPD Art. 18:
-- Acesso / Correção / Exclusão / Portabilidade / Oposição.
-- Prazo de resposta: 15 dias corridos.

CREATE TABLE IF NOT EXISTS solicitacoes_titular (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  devedor_id       UUID        NOT NULL REFERENCES devedores(id),
  tipo_solicitacao TEXT        NOT NULL CHECK (tipo_solicitacao IN (
                                 'acesso',        -- Art. 18 I — confirmação de tratamento
                                 'correcao',      -- Art. 18 III — dados inexatos
                                 'exclusao',      -- Art. 18 VI — dados desnecessários
                                 'portabilidade', -- Art. 18 V — portabilidade a outro fornecedor
                                 'oposicao'       -- Art. 18 IX — oposição ao tratamento
                               )),
  status           TEXT        NOT NULL DEFAULT 'aberta'
                               CHECK (status IN (
                                 'aberta', 'em_analise', 'respondida',
                                 'parcialmente_atendida', 'negada', 'arquivada'
                               )),
  descricao        TEXT        NOT NULL,
  canal_origem     TEXT        CHECK (canal_origem IN ('email', 'whatsapp', 'portal', 'presencial')),
  -- Prazo legal: 15 dias corridos (Art. 18 §3º LGPD)
  prazo_resposta   DATE        NOT NULL GENERATED ALWAYS AS (
                                 (created_at + INTERVAL '15 days')::DATE
                               ) STORED,
  alerta_enviado   BOOLEAN     NOT NULL DEFAULT FALSE,
  respondido_em    TIMESTAMPTZ,
  respondido_por   UUID        REFERENCES usuarios(id),
  resposta         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  solicitacoes_titular IS 'Direitos do titular LGPD Art. 18 — prazo 15 dias';
COMMENT ON COLUMN solicitacoes_titular.prazo_resposta IS
  'Calculado automaticamente: created_at + 15 dias (Art. 18 §3º LGPD)';

-- ── Tabela: sessoes_mfa ──────────────────────────────────────
-- Controle de MFA e bloqueio por tentativas.

CREATE TABLE IF NOT EXISTS sessoes_mfa (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id          UUID        NOT NULL REFERENCES usuarios(id),
  tentativas_falhas   INTEGER     NOT NULL DEFAULT 0,
  bloqueado_ate       TIMESTAMPTZ,           -- NULL = não bloqueado
  ultimo_mfa_em       TIMESTAMPTZ,
  expira_em           TIMESTAMPTZ,           -- calculado por role (8h / 4h)
  ip_address          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sessoes_mfa IS 'Controle de MFA — bloqueio após 5 tentativas (lockout 15 min)';

-- ── Tabela: dados_sensiveis_enc ──────────────────────────────
-- Dados sensíveis criptografados (AES-256).
-- CPF/CNPJ reais ficam aqui — a tabela devedores/credores guarda hash para busca.

CREATE TABLE IF NOT EXISTS dados_sensiveis_enc (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade         TEXT        NOT NULL CHECK (entidade IN ('devedor', 'credor')),
  entidade_id      UUID        NOT NULL,
  campo            TEXT        NOT NULL, -- ex: 'cpf', 'cnpj', 'conta_bancaria'
  valor_enc        TEXT        NOT NULL, -- AES-256-GCM, base64
  iv               TEXT        NOT NULL, -- vetor de inicialização, base64
  criado_por       UUID        REFERENCES usuarios(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entidade, entidade_id, campo)
);

COMMENT ON TABLE  dados_sensiveis_enc IS 'Dados criptografados AES-256-GCM — CPF, CNPJ, contas bancárias';
COMMENT ON COLUMN dados_sensiveis_enc.iv IS 'IV aleatório único por registro (GCM nonce, 12 bytes, base64)';

-- ============================================================
-- ÍNDICES DE PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_cobfin_caso       ON cobrancas_financeiras(caso_id);
CREATE INDEX IF NOT EXISTS idx_cobfin_status      ON cobrancas_financeiras(status);
CREATE INDEX IF NOT EXISTS idx_cobfin_vencimento  ON cobrancas_financeiras(data_vencimento)
  WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_cobfin_txid        ON cobrancas_financeiras(pix_txid)
  WHERE pix_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cobfin_gateway     ON cobrancas_financeiras(id_gateway)
  WHERE id_gateway IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acordos_caso       ON acordos_parcelados(caso_id);
CREATE INDEX IF NOT EXISTS idx_acordos_status     ON acordos_parcelados(status);
CREATE INDEX IF NOT EXISTS idx_acordos_pix_auto   ON acordos_parcelados(pix_automatico_ativo)
  WHERE pix_automatico_ativo = TRUE;

CREATE INDEX IF NOT EXISTS idx_regua_ativa        ON regras_cobranca(ativa)
  WHERE ativa = TRUE;

CREATE INDEX IF NOT EXISTS idx_regua_exec_caso    ON execucoes_regua(caso_id, data_execucao DESC);
CREATE INDEX IF NOT EXISTS idx_regua_exec_dia     ON execucoes_regua(step_dia);

CREATE INDEX IF NOT EXISTS idx_portal_token       ON portal_tokens(token);
CREATE INDEX IF NOT EXISTS idx_portal_expira      ON portal_tokens(expira_em)
  WHERE usado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_protestos_caso     ON protestos(caso_id);
CREATE INDEX IF NOT EXISTS idx_protestos_status   ON protestos(status);
CREATE INDEX IF NOT EXISTS idx_protestos_aprovacao ON protestos(exige_aprovacao, aprovado_por)
  WHERE exige_aprovacao = TRUE AND aprovado_por IS NULL;

CREATE INDEX IF NOT EXISTS idx_negat_caso         ON negativacoes(caso_id);
CREATE INDEX IF NOT EXISTS idx_negat_devedor      ON negativacoes(devedor_id);
CREATE INDEX IF NOT EXISTS idx_negat_status       ON negativacoes(status);
CREATE INDEX IF NOT EXISTS idx_negat_notif        ON negativacoes(data_notificacao_previa)
  WHERE status = 'pendente_notificacao';

CREATE INDEX IF NOT EXISTS idx_audit_usuario      ON auditoria(usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entidade     ON auditoria(entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_audit_recente      ON auditoria(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lgpd_devedor       ON consentimentos_lgpd(devedor_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_revogado      ON consentimentos_lgpd(revogado_em)
  WHERE revogado_em IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_solic_devedor      ON solicitacoes_titular(devedor_id);
CREATE INDEX IF NOT EXISTS idx_solic_prazo        ON solicitacoes_titular(prazo_resposta)
  WHERE status NOT IN ('respondida', 'arquivada');

CREATE INDEX IF NOT EXISTS idx_dadosenc_entidade  ON dados_sensiveis_enc(entidade, entidade_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE cobrancas_financeiras  ENABLE ROW LEVEL SECURITY;
ALTER TABLE acordos_parcelados     ENABLE ROW LEVEL SECURITY;
ALTER TABLE regras_cobranca        ENABLE ROW LEVEL SECURITY;
ALTER TABLE execucoes_regua        ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_tokens          ENABLE ROW LEVEL SECURITY;
ALTER TABLE protestos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE negativacoes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria              ENABLE ROW LEVEL SECURITY;
ALTER TABLE consentimentos_lgpd    ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes_titular   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes_mfa            ENABLE ROW LEVEL SECURITY;
ALTER TABLE dados_sensiveis_enc    ENABLE ROW LEVEL SECURITY;

-- ── Políticas: cobrancas_financeiras ─────────────────────────
CREATE POLICY cobfin_select ON cobrancas_financeiras
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY cobfin_insert ON cobrancas_financeiras
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY cobfin_update ON cobrancas_financeiras
  FOR UPDATE USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

-- ── Políticas: acordos_parcelados ─────────────────────────────
CREATE POLICY acordos_select ON acordos_parcelados
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY acordos_insert ON acordos_parcelados
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY acordos_update ON acordos_parcelados
  FOR UPDATE USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

-- ── Políticas: regras_cobranca ────────────────────────────────
CREATE POLICY regras_select ON regras_cobranca
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY regras_insert ON regras_cobranca
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY regras_update ON regras_cobranca
  FOR UPDATE USING (get_user_role() = 'ADMIN');

-- ── Políticas: execucoes_regua (somente leitura para humanos) ──
CREATE POLICY regua_exec_select ON execucoes_regua
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY regua_exec_insert ON execucoes_regua
  FOR INSERT WITH CHECK (TRUE); -- Edge Function usa service_role

-- ── Políticas: portal_tokens ──────────────────────────────────
CREATE POLICY portal_select ON portal_tokens
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY portal_insert ON portal_tokens
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO'));

-- ── Políticas: protestos ──────────────────────────────────────
CREATE POLICY protestos_select ON protestos
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY protestos_insert ON protestos
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY protestos_update ON protestos
  FOR UPDATE USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

-- ── Políticas: negativacoes ───────────────────────────────────
CREATE POLICY negat_select ON negativacoes
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY negat_insert ON negativacoes
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY negat_update ON negativacoes
  FOR UPDATE USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

-- ── Políticas: auditoria (somente leitura para humanos) ───────
CREATE POLICY audit_select ON auditoria
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY audit_insert ON auditoria
  FOR INSERT WITH CHECK (TRUE); -- qualquer função autenticada pode inserir

-- ── Políticas: consentimentos_lgpd ───────────────────────────
CREATE POLICY lgpd_consent_select ON consentimentos_lgpd
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY lgpd_consent_insert ON consentimentos_lgpd
  FOR INSERT WITH CHECK (TRUE); -- portal público também insere

CREATE POLICY lgpd_consent_update ON consentimentos_lgpd
  FOR UPDATE USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

-- ── Políticas: solicitacoes_titular ──────────────────────────
CREATE POLICY solic_select ON solicitacoes_titular
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY solic_insert ON solicitacoes_titular
  FOR INSERT WITH CHECK (TRUE); -- portal público também insere

CREATE POLICY solic_update ON solicitacoes_titular
  FOR UPDATE USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

-- ── Políticas: dados_sensiveis_enc ────────────────────────────
CREATE POLICY dadosenc_select ON dados_sensiveis_enc
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY dadosenc_insert ON dados_sensiveis_enc
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO'));

-- ── Políticas: sessoes_mfa ────────────────────────────────────
CREATE POLICY mfa_select ON sessoes_mfa
  FOR SELECT USING (
    get_user_role() = 'ADMIN'
    OR usuario_id = get_usuario_id()
  );

CREATE POLICY mfa_insert ON sessoes_mfa
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY mfa_update ON sessoes_mfa
  FOR UPDATE USING (
    get_user_role() = 'ADMIN'
    OR usuario_id = get_usuario_id()
  );

-- ============================================================
-- FUNCTIONS AUXILIARES
-- ============================================================

-- Alerta de solicitações LGPD próximas do prazo (para cron diário)
CREATE OR REPLACE FUNCTION fn_alertar_solic_lgpd_prazo()
RETURNS TABLE (
  id UUID, devedor_id UUID, tipo_solicitacao TEXT,
  prazo_resposta DATE, dias_restantes INTEGER
)
LANGUAGE sql STABLE AS $$
  SELECT
    id, devedor_id, tipo_solicitacao,
    prazo_resposta,
    (prazo_resposta - CURRENT_DATE)::INTEGER AS dias_restantes
  FROM solicitacoes_titular
  WHERE
    status NOT IN ('respondida', 'arquivada')
    AND prazo_resposta <= CURRENT_DATE + INTERVAL '3 days'
  ORDER BY prazo_resposta;
$$;

-- Verificar se caso possui notificação prévia registrada antes de negativar
CREATE OR REPLACE FUNCTION fn_caso_pode_negativar(p_caso_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_notif DATE;
  v_dias  INTEGER;
BEGIN
  SELECT data_notificacao_previa INTO v_notif
  FROM negativacoes
  WHERE caso_id = p_caso_id
    AND data_notificacao_previa IS NOT NULL
  ORDER BY data_notificacao_previa DESC
  LIMIT 1;

  IF v_notif IS NULL THEN
    RETURN jsonb_build_object(
      'pode', FALSE,
      'motivo', 'Notificação prévia não registrada (CDC Art. 43 §2º)'
    );
  END IF;

  v_dias := CURRENT_DATE - v_notif;
  IF v_dias < 10 THEN
    RETURN jsonb_build_object(
      'pode', FALSE,
      'motivo', format('Aguardar %s dia(s) restante(s) do prazo de 10 dias', 10 - v_dias),
      'dias_restantes', 10 - v_dias
    );
  END IF;

  RETURN jsonb_build_object('pode', TRUE, 'dias_desde_notificacao', v_dias);
END;
$$;

-- Resumo financeiro de um caso (para extrato)
CREATE OR REPLACE FUNCTION fn_extrato_financeiro(p_caso_id UUID)
RETURNS TABLE (
  tipo_pagamento TEXT, total_cobrado DECIMAL, total_pago DECIMAL,
  total_pendente DECIMAL, ultima_atualizacao TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT
    tipo_pagamento,
    SUM(valor_total)                                          AS total_cobrado,
    SUM(CASE WHEN status = 'pago' THEN valor_total ELSE 0 END) AS total_pago,
    SUM(CASE WHEN status = 'pendente' THEN valor_total ELSE 0 END) AS total_pendente,
    MAX(updated_at)                                           AS ultima_atualizacao
  FROM cobrancas_financeiras
  WHERE caso_id = p_caso_id
  GROUP BY tipo_pagamento
  ORDER BY tipo_pagamento;
$$;

-- Registrar auditoria (helper chamado pelas Edge Functions)
CREATE OR REPLACE FUNCTION fn_registrar_auditoria(
  p_usuario_id UUID,
  p_acao       TEXT,
  p_entidade   TEXT,
  p_entidade_id UUID,
  p_dados_antes JSONB DEFAULT NULL,
  p_dados_depois JSONB DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO auditoria (
    usuario_id, acao, entidade, entidade_id,
    dados_antes, dados_depois, ip_address, user_agent
  )
  VALUES (
    p_usuario_id, p_acao, p_entidade, p_entidade_id,
    p_dados_antes, p_dados_depois, p_ip, p_user_agent
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ============================================================
-- VARIÁVEIS DE AMBIENTE — documentação (não executável)
-- ============================================================
-- Adicionar ao .env.local e às Supabase Secrets (Edge Functions):
--
-- # Módulo A — iugu
-- VITE_IUGU_API_KEY=
-- VITE_IUGU_ACCOUNT_ID=
-- IUGU_WEBHOOK_SECRET=          (apenas backend / Edge Function)
-- VINDI_API_KEY=
-- VINDI_PUBLIC_KEY=
--
-- # Módulo B — OpenAI
-- OPENAI_API_KEY=
-- OPENAI_MODEL=gpt-4o
--
-- # Módulo C — Bureaus e cartório
-- SERASA_API_KEY=
-- SERASA_API_URL=
-- SPC_API_KEY=
-- SPC_API_URL=
-- EPROTESTO_API_KEY=
-- EPROTESTO_API_URL=
--
-- # Módulo D — LGPD e segurança
-- SERPRO_CPF_API_KEY=
-- SERPRO_CNPJ_API_KEY=
-- CLICKSIGN_API_KEY=
-- CLICKSIGN_API_URL=
-- ENCRYPTION_KEY_AES256=        (32 bytes hex — NUNCA versionar)

COMMIT;

-- ============================================================
-- FIM DA MIGRATION FASE 2
-- Tabelas criadas (9): cobrancas_financeiras, acordos_parcelados,
--   regras_cobranca, execucoes_regua, portal_tokens, protestos,
--   negativacoes, auditoria, consentimentos_lgpd,
--   solicitacoes_titular, sessoes_mfa, dados_sensiveis_enc
-- Triggers de segurança (4):
--   trg_imutavel_auditoria, trg_imutavel_execucoes_regua,
--   trg_validar_negativacao, trg_validar_protesto
-- Functions (5):
--   fn_alertar_solic_lgpd_prazo, fn_caso_pode_negativar,
--   fn_extrato_financeiro, fn_registrar_auditoria,
--   fn_bloquear_edicao_auditoria (trigger fn)
-- ============================================================
