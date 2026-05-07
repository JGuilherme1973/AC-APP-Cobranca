# AC-APP-Cobrança — ANDRADE & CINTRA Advogados

Sistema interno de gestão de cobranças e execuções judiciais.
Uso exclusivo do escritório ANDRADE & CINTRA Advogados — OAB/SP.

---

## Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Estilização:** TailwindCSS + CSS Variables institucionais
- **Componentes:** shadcn/ui customizado
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **E-mail:** Resend API
- **WhatsApp:** Evolution API / Twilio WhatsApp Business API
- **PDF:** jsPDF + jsPDF-AutoTable
- **Deploy:** Vercel / Netlify (compatível com Lovable)

---

## Pré-requisitos

- Node.js >= 18
- Conta Supabase (gratuita serve para desenvolvimento)
- Conta Resend (opcional para e-mails em dev)

---

## Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/JGuilherme1973/AC-APP-Cobranca.git
cd AC-APP-Cobranca

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com suas credenciais Supabase

# 4. Inicie o servidor de desenvolvimento
npm run dev
```

Acesse: http://localhost:5173

---

## Configuração do Supabase

### 1. Crie um projeto no Supabase

Acesse https://app.supabase.com e crie um novo projeto.

### 2. Execute o schema SQL

No **SQL Editor** do Supabase, execute o arquivo:

```
supabase/schema.sql
```

Execute em ordem — o arquivo está organizado sequencialmente.

### 3. Crie o bucket de armazenamento

No painel Supabase → **Storage**, crie um bucket privado chamado `documentos-cobranca`.

### 4. Crie o usuário administrador

1. No painel Supabase → **Authentication → Users**, crie o usuário com o e-mail do administrador
2. Copie o UUID gerado
3. Execute no SQL Editor:

```sql
INSERT INTO usuarios (auth_id, nome, email, role, oab)
VALUES (
  'UUID-DO-PASSO-ANTERIOR',
  'João Guilherme de Andrade Cintra',
  'jgac@cintraadvogados.com.br',
  'ADMIN',
  'OAB/SP XXXXX'
);
```

---

## Estrutura de Pastas

```
src/
├── components/cobranca/     # Componentes do módulo
├── hooks/cobranca/          # React hooks
├── lib/                     # Supabase, utils, PDF, email, WhatsApp
├── pages/Login.tsx          # Tela de login institucional
├── types/cobranca.ts        # Tipos TypeScript completos
├── App.tsx
├── main.tsx
└── index.css                # CSS variables + tipografia
supabase/
└── schema.sql               # Schema PostgreSQL completo
```

---

## Módulos do MVP (Fase 1)

| # | Módulo | Status |
|---|--------|--------|
| 1 | Tela de Login institucional | ✅ Concluído |
| 2 | Schema SQL Supabase | ✅ Concluído |
| 3 | Dashboard com métricas e alertas | 🔄 Em construção |
| 4 | Formulário multi-step Novo Caso | 🔄 Em construção |
| 5 | Lista de Casos com filtros | 🔄 Em construção |
| 6 | Ficha do Caso + Timeline | 🔄 Em construção |
| 7 | Painel de Comunicação | 🔄 Em construção |
| 8 | Gerador de Notificação Extrajudicial PDF | 🔄 Em construção |
| 9 | Calendário de Prazos | 🔄 Em construção |

---

## Regras de Negócio Críticas

**Prescrição (Arts. 205 e 206, §5º, I, CC):**
- 5 anos: Nota Promissória, Cheque, Duplicata, Contrato assinado, Confissão de Dívida, Sentença
- 10 anos: Regra geral (mútuo informal, prova digital, etc.)
- Alertas automáticos: 180, 90 e 30 dias antes do prazo
- Reconhecimento da dívida pelo devedor (Art. 202, VI) interrompe e reinicia o prazo

**Comunicações:** Log imutável — apenas INSERT, sem UPDATE ou DELETE.

**Documentos:** Nunca deletar — apenas marcar como `REVOGADO`.

**Ética OAB:** Templates aprovados pelo advogado antes do envio. Linguagem técnica e formal.

---

## Contato

**Responsável:** João Guilherme de Andrade Cintra
**E-mail:** jgac@cintraadvogados.com.br
**WhatsApp:** (11) 99607-1463
