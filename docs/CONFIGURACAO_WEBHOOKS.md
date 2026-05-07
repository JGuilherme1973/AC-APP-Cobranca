# VINDEX — Configuração de Webhooks

## Índice

1. [Visão Geral](#visão-geral)
2. [Webhook iugu (Pagamentos)](#webhook-iugu-pagamentos)
3. [Webhook Evolution API (WhatsApp)](#webhook-evolution-api-whatsapp)
4. [pg_cron — Jobs Automáticos](#pg_cron--jobs-automáticos)
5. [Supabase Secrets — API Keys](#supabase-secrets--api-keys)
6. [Checklist de Deploy](#checklist-de-deploy)

---

## Visão Geral

O VINDEX utiliza dois webhooks externos para processar eventos em tempo real:

| Integração     | Tipo de Evento                | Função Edge               |
|----------------|-------------------------------|---------------------------|
| iugu           | Pagamentos (faturas)          | `webhook-iugu`            |
| Evolution API  | Mensagens WhatsApp (devedores)| `webhook-whatsapp`        |

Além dos webhooks, há 4 jobs automáticos (pg_cron) que executam tarefas programadas diariamente.

---

## Webhook iugu (Pagamentos)

### URL do Webhook

```
https://<SEU_PROJECT_ID>.supabase.co/functions/v1/webhook-iugu
```

### Eventos Tratados

| Evento                   | Subtipo          | Ação no Sistema                                      |
|--------------------------|------------------|------------------------------------------------------|
| `invoice.status_changed` | `paid`           | Conciliação financeira, atualiza caso, avança régua  |
| `invoice.status_changed` | `expired`        | Marca título vencido, avança etapa da régua          |
| `invoice.created`        | —                | Registra nova fatura, cria registro em comunicacoes  |

### Autenticação HMAC-SHA256

A iugu assina cada requisição com HMAC-SHA256. A verificação é feita da seguinte forma:

1. A iugu envia o header `X-Iugu-Signature` com a assinatura da requisição.
2. A Edge Function recalcula a assinatura usando `IUGU_WEBHOOK_SECRET`.
3. Se as assinaturas não coincidirem, a requisição é rejeitada com HTTP 401.

**Gerar o secret:**
```bash
openssl rand -hex 32
# Exemplo: a1b2c3d4e5f6...
```

**Salvar no Supabase:**
```bash
supabase secrets set IUGU_WEBHOOK_SECRET=a1b2c3d4e5f6...
```

### Configurar na Plataforma iugu (Passo a Passo)

1. Acesse o painel da iugu: [https://app.iugu.com](https://app.iugu.com)
2. Vá em **Configurações** → **Webhooks** (menu lateral)
3. Clique em **Adicionar Webhook**
4. Preencha os campos:
   - **URL**: `https://<SEU_PROJECT_ID>.supabase.co/functions/v1/webhook-iugu`
   - **Tipo de autenticação**: HMAC-SHA256
   - **Secret**: o valor gerado acima (mesmo salvo em `IUGU_WEBHOOK_SECRET`)
5. Selecione os eventos:
   - `invoice.status_changed`
   - `invoice.created`
   - `invoice.expired`
6. Clique em **Salvar**
7. Use o botão **Testar** para enviar um evento de teste e verificar se retorna `200 OK`

> **Importante:** A Edge Function sempre retorna HTTP 200 para evitar loops de retry. Erros internos são logados no Supabase Logs.

---

## Webhook Evolution API (WhatsApp)

### URL do Webhook

```
https://<SEU_PROJECT_ID>.supabase.co/functions/v1/webhook-whatsapp
```

### Eventos Tratados

| Evento             | Descrição                            |
|--------------------|--------------------------------------|
| `messages.upsert`  | Nova mensagem recebida do devedor    |

Mensagens enviadas pelo próprio sistema (`fromMe: true`) são automaticamente ignoradas.

### Autenticação por Token (Opcional)

Para segurança adicional, configure um token secreto:

1. Gere um token:
   ```bash
   openssl rand -hex 24
   # Exemplo: 9f8e7d6c5b4a...
   ```
2. Salve no Supabase:
   ```bash
   supabase secrets set EVOLUTION_WEBHOOK_TOKEN=9f8e7d6c5b4a...
   ```
3. Configure na Evolution API para enviar o header:
   ```
   X-Evolution-Token: 9f8e7d6c5b4a...
   ```

Se `EVOLUTION_WEBHOOK_TOKEN` não estiver configurado, a validação de token é desativada.

### Configurar na Evolution API (Passo a Passo)

1. Acesse o painel da Evolution API (ou use a API REST diretamente)
2. Selecione a instância: `EVOLUTION_INSTANCE`
3. Vá em **Configurações** → **Webhook**
4. Preencha os campos:
   - **URL**: `https://<SEU_PROJECT_ID>.supabase.co/functions/v1/webhook-whatsapp`
   - **Habilitado**: `true`
   - **Webhook por Eventos**: `true`
5. Ative o evento **messages.upsert**
6. Se usar autenticação por token, adicione o header personalizado:
   - Chave: `X-Evolution-Token`
   - Valor: o token configurado em `EVOLUTION_WEBHOOK_TOKEN`
7. Salve e teste enviando uma mensagem para o número conectado

**Via API REST da Evolution:**
```bash
curl -X POST "https://<EVOLUTION_URL>/webhook/set/<INSTANCE>" \
  -H "apikey: <EVOLUTION_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<PROJECT_ID>.supabase.co/functions/v1/webhook-whatsapp",
    "webhook_by_events": true,
    "webhook_base64": false,
    "events": ["messages.upsert"]
  }'
```

### Resposta Automática (Opcional)

Para habilitar confirmação automática de recebimento:
```bash
supabase secrets set WHATSAPP_AUTO_REPLY=true
```

Quando habilitado, o sistema responde automaticamente:
> *"Recebemos sua mensagem. Nossa equipe entrará em contato em breve."*

---

## pg_cron — Jobs Automáticos

### Pré-requisitos

Habilitar as extensões no painel Supabase:
- **Database** → **Extensions** → buscar `pg_cron` → **Enable**
- **Database** → **Extensions** → buscar `pg_net` → **Enable**

### Configurar Variáveis de Ambiente do Banco

Execute no **SQL Editor** do Supabase **antes** de rodar a migration:

```sql
ALTER DATABASE postgres SET app.supabase_url    = 'https://SEU_PROJECT_ID.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### Jobs Configurados

| Job                           | Cron Expression | Horário UTC | Horário Brasília | Descrição                                              |
|-------------------------------|-----------------|-------------|------------------|--------------------------------------------------------|
| `processar-regua-diario`      | `0 10 * * *`    | 10:00 UTC   | 07:00 BRT        | Avança régua de cobrança, envia notificações           |
| `monitorar-negativacoes-diario` | `0 9 * * *`   | 09:00 UTC   | 06:00 BRT        | Consulta Serasa/SPC/eProtesto, atualiza status         |
| `alertas-lgpd-diario`         | `0 11 * * *`    | 11:00 UTC   | 08:00 BRT        | Verifica prazos LGPD críticos, alerta advogados        |
| `limpar-tokens-expirados`     | `0 5 * * 0`     | 05:00 UTC   | 02:00 BRT (Dom)  | Remove tokens expirados e sessões MFA antigas          |

> **Nota:** Brasília usa UTC-3 (BRT) no horário padrão e UTC-2 (BRST) no horário de verão. Os horários acima são para UTC-3 (BRT).

### Executar a Migration

```bash
# Opção 1 — via Supabase CLI
supabase db push

# Opção 2 — manual no SQL Editor
# Copiar e colar o conteúdo de: supabase/migrations/fase2_cron.sql
```

### Verificar Jobs Criados

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
ORDER BY jobname;
```

### Verificar Histórico de Execuções

```sql
SELECT jobid, jobname, start_time, end_time, status, return_message
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
```

### Desabilitar / Reabilitar um Job

```sql
-- Desabilitar temporariamente
UPDATE cron.job SET active = false WHERE jobname = 'processar-regua-diario';

-- Reabilitar
UPDATE cron.job SET active = true WHERE jobname = 'processar-regua-diario';
```

---

## Supabase Secrets — API Keys

Configure todos os secrets via Supabase CLI:

```bash
supabase secrets set NOME_DA_CHAVE=valor
```

Ou pelo painel: **Project Settings** → **Edge Functions** → **Secrets**.

### Tabela de Secrets Necessários

| Secret                  | Descrição                                                  | Onde Obter                                                      |
|-------------------------|------------------------------------------------------------|-----------------------------------------------------------------|
| `SERASA_API_KEY`         | Chave de acesso à API Serasa Experian                      | [https://developer.serasaexperian.com.br](https://developer.serasaexperian.com.br) |
| `SPC_API_KEY`            | Chave de acesso à API SPC Brasil                           | [https://developers.spcbrasil.org.br](https://developers.spcbrasil.org.br)         |
| `EPROTESTO_API_KEY`      | Chave de acesso à API eProtesto                            | [https://www.eprotesto.com.br](https://www.eprotesto.com.br) — Portal do Parceiro  |
| `OPENAI_API_KEY`         | Chave da API OpenAI (GPT para classificação IA)            | [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)       |
| `IUGU_API_KEY`           | Chave de produção iugu                                     | Painel iugu → Configurações → API                              |
| `IUGU_WEBHOOK_SECRET`    | Secret HMAC para validar webhooks da iugu                  | Gerado localmente: `openssl rand -hex 32`                       |
| `RESEND_API_KEY`         | Chave da API Resend para envio de e-mails                  | [https://resend.com/api-keys](https://resend.com/api-keys)      |
| `EVOLUTION_API_KEY`      | Chave de acesso à instância Evolution API                  | Painel Evolution API → Instâncias → API Key                    |
| `EVOLUTION_API_URL`      | URL base da Evolution API (ex: https://api.seudominio.com) | Configurado no deploy da Evolution API                          |
| `EVOLUTION_INSTANCE`     | Nome da instância WhatsApp na Evolution API                | Painel Evolution API → Instâncias                              |
| `EVOLUTION_WEBHOOK_TOKEN`| Token secreto para validar webhooks recebidos (opcional)   | Gerado localmente: `openssl rand -hex 24`                       |
| `SERPRO_CPF_API_KEY`     | Chave API Serpro para consulta de CPF                      | [https://apigateway.serpro.gov.br](https://apigateway.serpro.gov.br)               |
| `SERPRO_CNPJ_API_KEY`    | Chave API Serpro para consulta de CNPJ                     | [https://apigateway.serpro.gov.br](https://apigateway.serpro.gov.br)               |
| `ENCRYPTION_KEY_AES256`  | Chave AES-256 para criptografia de dados sensíveis         | Gerado localmente: `openssl rand -hex 32`                       |
| `ADMIN_EMAIL`            | E-mail do administrador para relatórios automáticos        | Definido internamente pela equipe                               |
| `APP_BASE_URL`           | URL base da aplicação (para links em e-mails)              | Ex: `https://app.vindex.com.br`                                 |
| `WHATSAPP_AUTO_REPLY`    | Habilitar resposta automática no WhatsApp (`true`/`false`) | Definido internamente (padrão: `false`)                         |

### Exemplo de Configuração em Lote

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxxxxxxxxxxx \
  OPENAI_API_KEY=sk-xxxxxxxxxxxx \
  IUGU_API_KEY=xxxxxxxxxxxx \
  IUGU_WEBHOOK_SECRET=$(openssl rand -hex 32) \
  EVOLUTION_API_KEY=xxxxxxxxxxxx \
  EVOLUTION_API_URL=https://evolution.seudominio.com \
  EVOLUTION_INSTANCE=vindex-producao \
  ADMIN_EMAIL=admin@vindex.com.br \
  APP_BASE_URL=https://app.vindex.com.br \
  ENCRYPTION_KEY_AES256=$(openssl rand -hex 32)
```

---

## Checklist de Deploy

Execute cada item na ordem indicada para garantir que o sistema funcione corretamente em produção.

### Fase 1 — Banco de Dados

1. [ ] Executar migration `fase2.sql` no SQL Editor do Supabase
2. [ ] Executar migration `fase2b.sql` no SQL Editor do Supabase
3. [ ] Habilitar extensão `pg_cron` em **Database → Extensions**
4. [ ] Habilitar extensão `pg_net` em **Database → Extensions**
5. [ ] Configurar variáveis GUC no banco:
   ```sql
   ALTER DATABASE postgres SET app.supabase_url    = 'https://SEU_ID.supabase.co';
   ALTER DATABASE postgres SET app.service_role_key = 'eyJ...';
   ```
6. [ ] Executar migration `fase2_cron.sql` no SQL Editor do Supabase
7. [ ] Verificar jobs criados: `SELECT * FROM cron.job;`

### Fase 2 — Edge Functions

8. [ ] Configurar todos os secrets necessários (ver tabela acima)
9. [ ] Deploy de todas as Edge Functions:
   ```bash
   supabase functions deploy processar-regua
   supabase functions deploy monitorar-negativacoes
   supabase functions deploy alertas-lgpd
   supabase functions deploy webhook-iugu
   supabase functions deploy webhook-whatsapp
   supabase functions deploy ia-regua
   supabase functions deploy portal-negociar
   supabase functions deploy proxy-serasa
   supabase functions deploy proxy-serpro
   supabase functions deploy proxy-eprotesto
   supabase functions deploy proxy-openai
   ```
10. [ ] Verificar logs de cada função após o deploy: **Supabase Dashboard → Edge Functions → Logs**

### Fase 3 — Webhooks Externos

11. [ ] Configurar webhook da iugu (ver seção [Webhook iugu](#webhook-iugu-pagamentos))
12. [ ] Testar webhook iugu com evento simulado — verificar retorno `200 OK`
13. [ ] Configurar webhook da Evolution API (ver seção [Webhook Evolution API](#webhook-evolution-api-whatsapp))
14. [ ] Testar webhook WhatsApp enviando mensagem de teste para o número conectado
15. [ ] Verificar se comunicação foi salva na tabela `comunicacoes`

### Fase 4 — Validação Final

16. [ ] Testar `processar-regua` manualmente:
    ```bash
    curl -X POST "https://SEU_ID.supabase.co/functions/v1/processar-regua" \
      -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
    ```
17. [ ] Testar `alertas-lgpd` manualmente e verificar e-mail recebido
18. [ ] Testar `monitorar-negativacoes` manualmente
19. [ ] Verificar se jobs do pg_cron estão ativos: `SELECT * FROM cron.job WHERE active = true;`
20. [ ] Verificar histórico de execução após o primeiro ciclo: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`
21. [ ] Confirmar recebimento de e-mails de alerta e relatórios no `ADMIN_EMAIL`
22. [ ] Revisar logs do Supabase por erros nas primeiras 24 horas

---

> **Suporte:** Para dúvidas sobre configuração, consulte a documentação oficial:
> - Supabase Edge Functions: https://supabase.com/docs/guides/functions
> - pg_cron: https://github.com/citusdata/pg_cron
> - Evolution API: https://doc.evolution-api.com
> - iugu Webhooks: https://dev.iugu.com/reference/gatilhos
> - Resend: https://resend.com/docs
