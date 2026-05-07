-- ============================================================
-- SCHEMA SUPABASE — AC-APP-Cobrança
-- ANDRADE & CINTRA Advogados
-- Executar no SQL Editor do Supabase (em ordem)
-- ============================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE tipo_pessoa       AS ENUM ('PF', 'PJ', 'DESCONHECIDO');
CREATE TYPE perfil_risco      AS ENUM ('baixo', 'medio', 'alto', 'desconhecido');
CREATE TYPE contato_whatsapp  AS ENUM ('sim', 'nao', 'tentativa');
CREATE TYPE indice_correcao   AS ENUM ('IPCA', 'IGPM', 'SELIC', 'CONTRATUAL');
CREATE TYPE status_prescricao AS ENUM ('VERDE', 'AMARELO', 'VERMELHO');
CREATE TYPE tipo_titulo       AS ENUM (
  'CONTRATO_ASSINADO', 'NOTA_PROMISSORIA', 'CONFISSAO_DIVIDA',
  'CHEQUE', 'DUPLICATA', 'COMPROVANTE_PIX_TED_DOC',
  'PROVA_DIGITAL', 'SENTENCA_JUDICIAL', 'OUTRO'
);
CREATE TYPE etapa_caso AS ENUM (
  'DIAGNOSTICO', 'ESTRATEGIA', 'COBRANCA_EXTRAJUDICIAL',
  'ACAO_JUDICIAL', 'EXECUCAO_RECUPERACAO'
);
CREATE TYPE via_processual AS ENUM (
  'ACAO_COBRANCA', 'ACAO_MONITORIA', 'EXECUCAO_TITULO_EXTRAJUDICIAL',
  'CUMPRIMENTO_SENTENCA', 'JEC', 'NEGOCIACAO_EXTRAJUDICIAL'
);
CREATE TYPE status_caso AS ENUM (
  'ATIVO', 'SUSPENSO', 'ENCERRADO_EXITO', 'ENCERRADO_SEM_EXITO', 'PRESCRITO'
);
CREATE TYPE canal_comunicacao AS ENUM ('EMAIL', 'WHATSAPP', 'CARTORIO');
CREATE TYPE status_envio AS ENUM (
  'ENVIADO', 'ENTREGUE', 'ABERTO', 'ERRO', 'RECUSADO', 'SEM_RETORNO'
);
CREATE TYPE prioridade_tarefa AS ENUM ('ALTA', 'MEDIA', 'BAIXA');
CREATE TYPE status_tarefa     AS ENUM ('A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDA', 'BLOQUEADA');
CREATE TYPE tipo_evento AS ENUM (
  'ABERTURA_CASO', 'COMUNICACAO_ENVIADA', 'RESPOSTA_RECEBIDA',
  'PAGAMENTO_PARCIAL', 'DISTRIBUICAO_ACAO', 'DECISAO_JUDICIAL',
  'PENHORA_EFETIVADA', 'ACORDO_FECHADO', 'ENCERRAMENTO_CASO', 'OUTRO'
);
CREATE TYPE tipo_pagamento AS ENUM (
  'PAGAMENTO_DEVEDOR', 'HONORARIOS_CLIENTE',
  'DESPESA_PROCESSUAL', 'HONORARIOS_SUCUMBENCIA'
);
CREATE TYPE role_usuario AS ENUM ('ADMIN', 'ADVOGADO', 'ASSISTENTE', 'CLIENTE');
CREATE TYPE status_documento AS ENUM ('ATIVO', 'REVOGADO');

-- ============================================================
-- TABELA: usuarios
-- ============================================================

CREATE TABLE usuarios (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id    UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  nome       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  role       role_usuario NOT NULL DEFAULT 'ADVOGADO',
  oab        TEXT,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  usuarios            IS 'Usuários internos do escritório e portal do cliente.';
COMMENT ON COLUMN usuarios.auth_id    IS 'Referência ao auth.users do Supabase.';
COMMENT ON COLUMN usuarios.oab        IS 'Número de inscrição na OAB (apenas advogados).';

-- ============================================================
-- TABELA: credores
-- ============================================================

CREATE TABLE credores (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo                     tipo_pessoa NOT NULL DEFAULT 'PF',
  nome                     TEXT NOT NULL,
  -- CPF/CNPJ armazenado criptografado (pgcrypto)
  cpf_cnpj_enc             BYTEA,
  rg_inscricao_estadual    TEXT,
  data_nascimento_fundacao DATE,
  email                    TEXT,
  whatsapp                 TEXT,
  telefone                 TEXT,
  cep                      TEXT NOT NULL,
  endereco_completo        TEXT NOT NULL,
  cidade                   TEXT NOT NULL,
  estado                   CHAR(2) NOT NULL,
  profissao                TEXT,
  ramo_atividade           TEXT,
  representante_legal      JSONB,    -- { nome, cpf, cargo }
  observacoes              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN credores.cpf_cnpj_enc        IS 'CPF/CNPJ criptografado em repouso via pgcrypto.';
COMMENT ON COLUMN credores.representante_legal  IS 'Somente quando tipo = PJ. JSON: { nome, cpf, cargo }.';

-- ============================================================
-- TABELA: devedores
-- ============================================================

CREATE TABLE devedores (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo                 tipo_pessoa NOT NULL DEFAULT 'PF',
  nome                 TEXT NOT NULL,
  cpf_cnpj_enc         BYTEA,         -- não obrigatório
  perfil_risco         perfil_risco NOT NULL DEFAULT 'desconhecido',
  enderecos            TEXT[]   NOT NULL DEFAULT '{}',
  telefones            TEXT[]   NOT NULL DEFAULT '{}',
  emails               TEXT[]   NOT NULL DEFAULT '{}',
  bens_conhecidos      JSONB,   -- { imoveis[], veiculos[], contas_bancarias[] }
  relacionamento_credor TEXT,
  advogado_devedor     TEXT,
  contatavel_whatsapp  contato_whatsapp NOT NULL DEFAULT 'tentativa',
  observacoes          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN devedores.cpf_cnpj_enc IS 'CPF/CNPJ do devedor — não obrigatório, criptografado quando informado.';
COMMENT ON COLUMN devedores.bens_conhecidos IS 'JSON com listas de imóveis, veículos e contas bancárias conhecidos.';

-- ============================================================
-- TABELA: titulos
-- ============================================================

CREATE TABLE titulos (
  id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credor_id                       UUID NOT NULL REFERENCES credores(id),
  devedor_id                      UUID NOT NULL REFERENCES devedores(id),
  tipo_titulo                     tipo_titulo NOT NULL,
  valor_original                  NUMERIC(15,2) NOT NULL CHECK (valor_original > 0),
  data_origem                     DATE NOT NULL,
  data_vencimento                 DATE NOT NULL,
  indice_correcao                 indice_correcao NOT NULL DEFAULT 'IPCA',
  juros_mensais                   NUMERIC(6,4) NOT NULL DEFAULT 1.0 CHECK (juros_mensais >= 0),
  multa_percentual                NUMERIC(6,4) NOT NULL DEFAULT 2.0 CHECK (multa_percentual >= 0),
  valor_atualizado                NUMERIC(15,2) NOT NULL,
  -- Prescrição (Arts. 205 e 206, §5º, I, CC)
  prazo_prescricional_anos        SMALLINT NOT NULL CHECK (prazo_prescricional_anos IN (5, 10)),
  data_inicio_prescricao          DATE NOT NULL,
  data_limite_ajuizamento         DATE NOT NULL,
  status_prescricao               status_prescricao NOT NULL DEFAULT 'VERDE',
  interrupcao_prescricao_data     DATE,
  interrupcao_prescricao_motivo   TEXT,
  observacoes_prova               TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN titulos.prazo_prescricional_anos IS '5 anos (Art. 206, §5º, I) para títulos formalizados; 10 anos (Art. 205) para regra geral.';
COMMENT ON COLUMN titulos.interrupcao_prescricao_data IS 'Data do ato interruptivo — Art. 202, VI, CC (reconhecimento da dívida pelo devedor).';
COMMENT ON COLUMN titulos.valor_atualizado IS 'Calculado pelo frontend com base em índice, juros e multa. Atualizar via trigger ou Edge Function.';

-- ============================================================
-- TABELA: casos
-- ============================================================

CREATE TABLE casos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo_id           UUID NOT NULL REFERENCES titulos(id),
  via_processual      via_processual,
  etapa_atual         etapa_caso NOT NULL DEFAULT 'DIAGNOSTICO',
  advogado_id         UUID NOT NULL REFERENCES usuarios(id),
  numero_processo     TEXT,
  tribunal            TEXT,
  vara                TEXT,
  link_tribunal       TEXT,
  status              status_caso NOT NULL DEFAULT 'ATIVO',
  data_abertura       DATE NOT NULL DEFAULT CURRENT_DATE,
  data_encerramento   DATE,
  -- Pesquisa patrimonial
  sisbajud_resultado  TEXT,
  sisbajud_data       DATE,
  renajud_resultado   TEXT,
  renajud_data        DATE,
  infojud_resultado   TEXT,
  infojud_data        DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE casos IS 'Cada caso vincula um título a um advogado responsável e percorre as 5 etapas do workflow.';

-- ============================================================
-- TABELA: comunicacoes (imutável — apenas INSERT)
-- ============================================================

CREATE TABLE comunicacoes (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caso_id            UUID NOT NULL REFERENCES casos(id),
  canal              canal_comunicacao NOT NULL,
  tipo_template      TEXT NOT NULL,
  destinatario       TEXT NOT NULL,
  status_envio       status_envio NOT NULL DEFAULT 'ENVIADO',
  data_envio         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  conteudo           TEXT NOT NULL,
  protocolo_cartorial TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE comunicacoes IS 'Log imutável de todas as comunicações. Apenas INSERT é permitido via RLS.';

-- Impede UPDATE e DELETE via trigger
CREATE OR REPLACE FUNCTION bloquear_edicao_comunicacoes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registros de comunicação são imutáveis. Operação não permitida.';
END;
$$;

CREATE TRIGGER trg_imutavel_comunicacoes
  BEFORE UPDATE OR DELETE ON comunicacoes
  FOR EACH ROW EXECUTE FUNCTION bloquear_edicao_comunicacoes();

-- ============================================================
-- TABELA: tarefas
-- ============================================================

CREATE TABLE tarefas (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caso_id        UUID NOT NULL REFERENCES casos(id),
  descricao      TEXT NOT NULL,
  responsavel_id UUID NOT NULL REFERENCES usuarios(id),
  prazo          DATE NOT NULL,
  prioridade     prioridade_tarefa NOT NULL DEFAULT 'MEDIA',
  status         status_tarefa NOT NULL DEFAULT 'A_FAZER',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: eventos_timeline (imutável — apenas INSERT)
-- ============================================================

CREATE TABLE eventos_timeline (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caso_id     UUID NOT NULL REFERENCES casos(id),
  tipo_evento tipo_evento NOT NULL DEFAULT 'OUTRO',
  descricao   TEXT NOT NULL,
  data_evento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE eventos_timeline IS 'Timeline cronológica imutável de cada caso.';

CREATE OR REPLACE FUNCTION bloquear_edicao_timeline()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Eventos da timeline são imutáveis. Operação não permitida.';
END;
$$;

CREATE TRIGGER trg_imutavel_timeline
  BEFORE UPDATE OR DELETE ON eventos_timeline
  FOR EACH ROW EXECUTE FUNCTION bloquear_edicao_timeline();

-- ============================================================
-- TABELA: pagamentos
-- ============================================================

CREATE TABLE pagamentos (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caso_id        UUID NOT NULL REFERENCES casos(id),
  valor          NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  data_pagamento DATE NOT NULL,
  tipo           tipo_pagamento NOT NULL,
  observacao     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABELA: documentos (nunca deletar — apenas revogar)
-- ============================================================

CREATE TABLE documentos (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caso_id        UUID NOT NULL REFERENCES casos(id),
  nome_arquivo   TEXT NOT NULL,
  url_storage    TEXT NOT NULL,
  tipo_documento TEXT NOT NULL,
  status         status_documento NOT NULL DEFAULT 'ATIVO',
  data_upload    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE documentos IS 'Documentos nunca são deletados — apenas marcados como REVOGADO.';

-- Impede DELETE físico de documentos
CREATE OR REPLACE FUNCTION bloquear_delete_documentos()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Documentos não podem ser excluídos. Use status = REVOGADO.';
END;
$$;

CREATE TRIGGER trg_nodelet_documentos
  BEFORE DELETE ON documentos
  FOR EACH ROW EXECUTE FUNCTION bloquear_delete_documentos();

-- ============================================================
-- INDEXES PARA PERFORMANCE
-- ============================================================

CREATE INDEX idx_titulos_credor      ON titulos(credor_id);
CREATE INDEX idx_titulos_devedor     ON titulos(devedor_id);
CREATE INDEX idx_titulos_prescricao  ON titulos(status_prescricao, data_limite_ajuizamento);
CREATE INDEX idx_casos_advogado      ON casos(advogado_id);
CREATE INDEX idx_casos_status        ON casos(status);
CREATE INDEX idx_casos_etapa         ON casos(etapa_atual);
CREATE INDEX idx_comunicacoes_caso   ON comunicacoes(caso_id, data_envio DESC);
CREATE INDEX idx_tarefas_prazo       ON tarefas(prazo, status);
CREATE INDEX idx_tarefas_responsavel ON tarefas(responsavel_id);
CREATE INDEX idx_eventos_caso        ON eventos_timeline(caso_id, data_evento DESC);
CREATE INDEX idx_pagamentos_caso     ON pagamentos(caso_id, data_pagamento DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE usuarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE credores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE devedores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE titulos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE casos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE comunicacoes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarefas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos       ENABLE ROW LEVEL SECURITY;

-- Helper: obtém o role do usuário autenticado
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS role_usuario LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM usuarios WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- Helper: obtém o id interno do usuário autenticado
CREATE OR REPLACE FUNCTION get_usuario_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM usuarios WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- Admins e advogados veem tudo; assistentes veem tudo; clientes veem apenas seus casos
CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT USING (
    get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE')
    OR auth_id = auth.uid()
  );

CREATE POLICY "credores_select" ON credores
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY "credores_insert" ON credores
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY "credores_update" ON credores
  FOR UPDATE USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY "devedores_select" ON devedores
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY "devedores_insert" ON devedores
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY "devedores_update" ON devedores
  FOR UPDATE USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY "titulos_select" ON titulos
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY "titulos_insert" ON titulos
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY "titulos_update" ON titulos
  FOR UPDATE USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY "casos_select" ON casos
  FOR SELECT USING (
    get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE')
    OR (
      get_user_role() = 'CLIENTE'
      AND titulo_id IN (
        SELECT t.id FROM titulos t
        JOIN credores c ON c.id = t.credor_id
        WHERE c.id IN (
          SELECT id FROM credores WHERE email = (
            SELECT email FROM usuarios WHERE auth_id = auth.uid()
          )
        )
      )
    )
  );

CREATE POLICY "casos_insert" ON casos
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY "casos_update" ON casos
  FOR UPDATE USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY "comunicacoes_select" ON comunicacoes
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY "comunicacoes_insert" ON comunicacoes
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY "tarefas_select" ON tarefas
  FOR SELECT USING (
    get_user_role() IN ('ADMIN', 'ADVOGADO')
    OR (get_user_role() = 'ASSISTENTE' AND responsavel_id = get_usuario_id())
  );

CREATE POLICY "tarefas_insert" ON tarefas
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY "tarefas_update" ON tarefas
  FOR UPDATE USING (
    get_user_role() IN ('ADMIN', 'ADVOGADO')
    OR (get_user_role() = 'ASSISTENTE' AND responsavel_id = get_usuario_id())
  );

CREATE POLICY "timeline_select" ON eventos_timeline
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY "timeline_insert" ON eventos_timeline
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY "pagamentos_select" ON pagamentos
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY "pagamentos_insert" ON pagamentos
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO'));

CREATE POLICY "documentos_select" ON documentos
  FOR SELECT USING (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY "documentos_insert" ON documentos
  FOR INSERT WITH CHECK (get_user_role() IN ('ADMIN', 'ADVOGADO', 'ASSISTENTE'));

CREATE POLICY "documentos_update_status" ON documentos
  FOR UPDATE USING (get_user_role() IN ('ADMIN', 'ADVOGADO'));

-- ============================================================
-- FUNÇÃO: Atualizar status de prescrição automaticamente
-- (executar via cron Edge Function ou trigger)
-- ============================================================

CREATE OR REPLACE FUNCTION atualizar_status_prescricao()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE titulos SET status_prescricao =
    CASE
      WHEN data_limite_ajuizamento < CURRENT_DATE                               THEN 'VERMELHO'
      WHEN data_limite_ajuizamento <= CURRENT_DATE + INTERVAL '180 days'        THEN 'AMARELO'
      ELSE 'VERDE'
    END
  WHERE status_prescricao != (
    CASE
      WHEN data_limite_ajuizamento < CURRENT_DATE                               THEN 'VERMELHO'
      WHEN data_limite_ajuizamento <= CURRENT_DATE + INTERVAL '180 days'        THEN 'AMARELO'
      ELSE 'VERDE'
    END
  )::status_prescricao;
END;
$$;

COMMENT ON FUNCTION atualizar_status_prescricao IS
  'Atualiza status_prescricao de todos os títulos. Chamar via Edge Function cron diário.';

-- ============================================================
-- STORAGE BUCKET (executar via Supabase Dashboard ou API)
-- ============================================================

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('documentos-cobranca', 'documentos-cobranca', FALSE);

-- ============================================================
-- SEED: Usuário administrador inicial
-- ============================================================

-- Após criar o usuário no Supabase Auth, executar:
-- INSERT INTO usuarios (auth_id, nome, email, role, oab)
-- VALUES (
--   '<uuid-do-auth-user>',
--   'João Guilherme de Andrade Cintra',
--   'jgac@cintraadvogados.com.br',
--   'ADMIN',
--   'OAB/SP XXXXX'
-- );
