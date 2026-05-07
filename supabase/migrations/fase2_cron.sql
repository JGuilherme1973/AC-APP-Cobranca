-- ============================================================
-- FASE 2 — Configuração pg_cron
-- Executar uma vez após o deploy. Requer extensão pg_cron.
-- No Supabase: vá em Database → Extensions → habilitar pg_cron
-- ============================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;  -- para chamadas HTTP

-- ============================================================
-- CONFIGURAÇÃO: definir variáveis de ambiente do app
-- Execute ANTES de criar os jobs:
-- ALTER DATABASE postgres SET app.supabase_url = 'https://xxx.supabase.co';
-- ALTER DATABASE postgres SET app.service_role_key = 'eyJ...';
-- ============================================================

-- Remover jobs existentes (idempotente)
SELECT cron.unschedule('processar-regua-diario')        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'processar-regua-diario');
SELECT cron.unschedule('monitorar-negativacoes-diario') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monitorar-negativacoes-diario');
SELECT cron.unschedule('alertas-lgpd-diario')           WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alertas-lgpd-diario');
SELECT cron.unschedule('limpar-tokens-expirados')       WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar-tokens-expirados');

-- ============================================================
-- JOB 1 — Processar régua de cobrança
-- Horário: 10:00 UTC = 07:00 Brasília (BRT = UTC-3)
-- ============================================================
SELECT cron.schedule(
  'processar-regua-diario',
  '0 10 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/processar-regua',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

COMMENT ON COLUMN cron.job.jobname IS
  'processar-regua-diario: Dispara a régua de cobrança às 07h Brasília. '
  'Avança etapas (D+1, D+5, D+10...), envia notificações (e-mail, WhatsApp, SMS) '
  'e registra ações na timeline.';

-- ============================================================
-- JOB 2 — Monitorar negativações
-- Horário: 09:00 UTC = 06:00 Brasília (BRT = UTC-3)
-- ============================================================
SELECT cron.schedule(
  'monitorar-negativacoes-diario',
  '0 9 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/monitorar-negativacoes',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

COMMENT ON COLUMN cron.job.command IS
  'monitorar-negativacoes-diario: Consulta Serasa/SPC/eProtesto às 06h Brasília. '
  'Verifica status de negativações ativas, dispara alertas de pendências '
  'e atualiza o campo situacao_negativacao nos casos.';

-- ============================================================
-- JOB 3 — Alertas de prazo LGPD
-- Horário: 11:00 UTC = 08:00 Brasília (BRT = UTC-3)
-- ============================================================
SELECT cron.schedule(
  'alertas-lgpd-diario',
  '0 11 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/alertas-lgpd',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);

COMMENT ON COLUMN cron.job.schedule IS
  'alertas-lgpd-diario: Verifica solicitações de titulares (LGPD) com prazo crítico '
  'às 08h Brasília. Envia e-mail urgente ao advogado responsável quando o prazo '
  'de resposta (15 dias por lei) estiver a 3 dias ou menos de vencer.';

-- ============================================================
-- JOB 4 — Limpeza de tokens expirados
-- Horário: todo domingo 05:00 UTC = domingo 02:00 Brasília
-- ============================================================
SELECT cron.schedule(
  'limpar-tokens-expirados',
  '0 5 * * 0',
  $$
    -- Remover portal_tokens expirados e já utilizados (mais de 30 dias)
    DELETE FROM portal_tokens
    WHERE expira_em < NOW() - INTERVAL '30 days'
      AND usado_em IS NOT NULL;

    -- Remover sessões MFA antigas com falhas (mais de 90 dias)
    DELETE FROM sessoes_mfa
    WHERE created_at < NOW() - INTERVAL '90 days'
      AND tentativas_falhas > 0;
  $$
);

COMMENT ON COLUMN cron.job.username IS
  'limpar-tokens-expirados: Manutenção semanal todo domingo às 02h Brasília. '
  'Remove portal_tokens expirados há mais de 30 dias e sessões MFA com falhas '
  'há mais de 90 dias. Mantém o banco limpo sem afetar registros ativos.';

-- ============================================================
-- VERIFICAÇÃO — conferir jobs cadastrados
-- ============================================================
-- SELECT jobid, jobname, schedule, command, active
-- FROM cron.job
-- ORDER BY jobname;

-- ============================================================
-- INSTRUÇÕES DE SETUP MANUAL (executar antes deste script)
-- ============================================================
--
-- 1. Habilitar extensões no painel Supabase:
--    Database → Extensions → pesquisar "pg_cron"  → Enable
--    Database → Extensions → pesquisar "pg_net"   → Enable
--
-- 2. Configurar variáveis de ambiente do banco (via SQL Editor):
--    ALTER DATABASE postgres SET app.supabase_url    = 'https://SEU_PROJECT_ID.supabase.co';
--    ALTER DATABASE postgres SET app.service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
--
-- 3. Reiniciar conexão para aplicar os GUCs:
--    Encerrar e reabrir o SQL Editor ou aguardar reconexão automática.
--
-- 4. Executar este script completo no SQL Editor.
--
-- 5. Verificar jobs criados:
--    SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
--
-- 6. Verificar histórico de execuções:
--    SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--
-- 7. Para desabilitar temporariamente um job sem removê-lo:
--    UPDATE cron.job SET active = false WHERE jobname = 'processar-regua-diario';
--
-- 8. Para reabilitar:
--    UPDATE cron.job SET active = true WHERE jobname = 'processar-regua-diario';
--
-- ============================================================
-- RESUMO DOS JOBS
-- ============================================================
--
-- | Job                          | Cron        | UTC   | Brasília |
-- |------------------------------|-------------|-------|----------|
-- | processar-regua-diario       | 0 10 * * *  | 10:00 | 07:00    |
-- | monitorar-negativacoes-diario| 0  9 * * *  | 09:00 | 06:00    |
-- | alertas-lgpd-diario          | 0 11 * * *  | 11:00 | 08:00    |
-- | limpar-tokens-expirados      | 0  5 * * 0  | 05:00 | 02:00 Dom|
--
-- ============================================================
