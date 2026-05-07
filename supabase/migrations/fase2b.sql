-- ============================================================
-- FASE 2B — Campos adicionais para Módulo B (Régua de Cobrança)
-- Migration incremental — não altera o que já existe
-- ============================================================

BEGIN;

-- Adicionar regua_id e controle de pausa ao casos
ALTER TABLE casos
  ADD COLUMN IF NOT EXISTS regua_id        UUID REFERENCES regras_cobranca(id),
  ADD COLUMN IF NOT EXISTS regua_pausada   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS regua_pausada_em TIMESTAMPTZ;

-- Índice para o motor buscar casos por régua
CREATE INDEX IF NOT EXISTS idx_casos_regua ON casos(regua_id)
  WHERE status = 'ATIVO' AND regua_pausada = FALSE;

-- Após inserir a régua padrão (feita na fase2.sql),
-- atribuir automaticamente a todos os casos ativos sem régua
UPDATE casos
SET regua_id = (
  SELECT id FROM regras_cobranca
  WHERE nome = 'Régua Padrão A&C' AND ativa = TRUE
  LIMIT 1
)
WHERE regua_id IS NULL AND status = 'ATIVO';

COMMIT;
