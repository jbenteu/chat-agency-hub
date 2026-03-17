

# Plano: CRM Multi-Tenant com Supabase Externo

## Entendimento

Você quer usar seu **próprio projeto Supabase** (externo), sem depender do Lovable Cloud. Isso é totalmente possível — o Lovable suporta conexão com Supabase externo.

## Como funciona

Para conectar seu Supabase externo ao Lovable, você precisará fornecer:

1. **VITE_SUPABASE_URL** — URL do seu projeto (pública, fica no código)
2. **VITE_SUPABASE_ANON_KEY** — Chave anon/pública (fica no código)
3. **Secrets para Edge Functions** — `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SECRET` serão armazenados como secrets seguros no Lovable (acessíveis apenas por edge functions)

As **Edge Functions** serão criadas aqui no Lovable mas você precisará **deployá-las no seu próprio Supabase** via CLI (`supabase functions deploy`). Eu gero todo o código, você faz o deploy.

O **schema SQL** (tabelas, RLS, indexes) também será gerado aqui como arquivos `.sql` para você executar no SQL Editor do seu Supabase.

## Abordagem da Fase 1

### 1. Frontend completo
- Design system claro e limpo (estilo Linear/Notion)
- Layout com sidebar responsiva (Dashboard, CRM, WhatsApp, Configurações, Admin)
- Páginas placeholder para todos os módulos
- Sistema de rotas com proteção por role
- Componentes base: cards, skeleton loaders, estados vazios

### 2. Integração Supabase (client-side)
- Criar arquivo de configuração do Supabase client usando variáveis `VITE_SUPABASE_*`
- Configurar tipos TypeScript para o banco
- Auth provider com login/signup por email
- Hook de sessão e proteção de rotas

### 3. Schema SQL (arquivos para você executar)
- Arquivo `supabase/schema.sql` com todas as 14+ tabelas
- Arquivo `supabase/rls-policies.sql` com todas as policies
- Arquivo `supabase/indexes.sql` com índices otimizados
- Enum `app_role`, função `has_role()` security definer
- Multi-tenancy com `tenant_id` em todas as tabelas

### 4. Edge Functions (código para deploy manual)
- Estrutura em `supabase/functions/` pronta para deploy
- `create-whatsapp-instance`, `evolution-webhook`, `send-whatsapp-text`, etc.
- CORS configurado, validação de input, segurança

## Próximo passo

Antes de começar, preciso que você me forneça:
- **URL do seu projeto Supabase** (ex: `https://xxxxx.supabase.co`)
- **Anon Key** (chave pública)

Com isso, começo pela estrutura frontend + schema SQL + auth.

