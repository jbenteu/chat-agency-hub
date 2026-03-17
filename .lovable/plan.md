
Objetivo: destravar o deploy da Edge Function `evolution-api` após erro `error running container: exit 1`.

O que já validei no projeto
- A função existe em `supabase/functions/evolution-api/index.ts`.
- `supabase/config.toml` já está com `verify_jwt = false` (correto para validar JWT em código).
- Os secrets existem no projeto (`EVOLUTION_API_URL` e `EVOLUTION_API_KEY`).
- Não há `deno.lock` no repositório (bom, evita um dos erros comuns de runtime).

Plano de ação (rápido e seguro)
1) Diagnóstico com log detalhado (sem alterar código)
- Rodar:
  - `supabase --version`
  - `supabase update`
  - `supabase link --project-ref ocfojfyiyzhnriorovqh`
  - `supabase secrets list`
  - `supabase functions deploy evolution-api --project-ref ocfojfyiyzhnriorovqh --debug --use-api`
- Motivo: `--use-api` evita problemas locais de container/docker que frequentemente causam `exit 1`.

2) Se ainda falhar, aplicar hardening na função para estabilidade de build/deploy
- Ajustes planejados em `supabase/functions/evolution-api/index.ts`:
  - Trocar import de `https://esm.sh/@supabase/supabase-js@2` para `npm:@supabase/supabase-js@2` (menos suscetível a falhas de resolução no bundle).
  - Adicionar logs de presença de variáveis (booleano), sem expor valores.
  - Remover variável não utilizada (`instanceId`), limpando warnings.
  - Envolver `req.json()` com validação defensiva para payload inválido.
- Manter `verify_jwt = false` e `getClaims()` como já está.

3) Re-deploy e validação funcional ponta a ponta
- Re-deploy:
  - `supabase functions deploy evolution-api --project-ref ocfojfyiyzhnriorovqh --debug --use-api`
- Teste E2E no app:
  - Entrar em `/whatsapp`
  - Criar instância
  - Gerar QR Code
  - Verificar status até “Conectado”
- Checagem de logs:
  - `supabase functions logs evolution-api --project-ref ocfojfyiyzhnriorovqh`

Detalhes técnicos (curto)
```text
Frontend (/whatsapp)
   -> supabase.functions.invoke("evolution-api")
      -> Edge Function (auth + tenant scope + Evolution proxy)
         -> Evolution API (/instance/create, /connect, /connectionState)
         -> Supabase DB (whatsapp_instances)
```

Critérios de sucesso
- Deploy conclui sem `exit 1`.
- Chamada `list_instances` responde 200.
- Fluxo “sem instância conectada -> gerar QR -> conectar” funciona no UI.
