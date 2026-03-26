

## Plano: Limpeza de dados do CRM

Preservar apenas o administrador `operacional@advanced-mkt.com.br` e remover todos os outros usuários e registros de instâncias.

### Ordem de execução (respeitando foreign keys)

1. **Identificar o admin** — consultar `profiles` e `auth.users` para confirmar o UUID do admin
2. **Deletar dados dependentes** (na ordem correta):
   - `whatsapp_messages` — todas as mensagens de tenants que não pertencem ao admin
   - `whatsapp_conversations` — todas as conversas
   - `conversation_ai_analysis`, `ai_conversation_analysis`, `ai_analysis_queue`, `ai_dashboard_cache`
   - `activities`, `tasks`, `deals`, `contacts`
   - `quick_replies`, `tags`, `pipeline_stages`
   - `tenant_assignments` — exceto as do admin
   - `user_relationships` — exceto as do admin
   - `import_progress`
3. **Deletar instâncias WhatsApp** — todas de tenants de outros usuários
4. **Deletar user_roles** — de todos os usuários exceto o admin
5. **Deletar profiles** — de todos exceto o admin
6. **Deletar tenants** — de todos os outros usuários
7. **Deletar usuários do auth.users** — via Edge Function com service_role (não é possível via SQL direto)

### Detalhes técnicos

- As deleções serão feitas via `psql` (INSERT tool tem acesso a DELETE) e uma Edge Function temporária para remover usuários de `auth.users`
- Todas as queries filtrarão com `WHERE user_id != '<admin_uuid>'` ou `WHERE tenant_id NOT IN (select tenant do admin)`
- O admin e seu tenant, roles, profile e instâncias serão preservados integralmente

