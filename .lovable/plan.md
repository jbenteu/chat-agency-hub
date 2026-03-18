

## Diagnóstico

O erro 404 indica que a Edge Function `evolution-webhook` **não está deployada** no seu projeto Supabase (`ocfojfyiyzhnriorovqh`). O código existe localmente, mas a função precisa ser publicada para que a Evolution API consiga enviar webhooks.

## Ações Necessárias (fora do Lovable)

### 1. Deploy das Edge Functions

Você precisa fazer o deploy de ambas as funções via Supabase CLI:

```
supabase functions deploy evolution-webhook --use-api --project-ref ocfojfyiyzhnriorovqh
supabase functions deploy evolution-api --use-api --project-ref ocfojfyiyzhnriorovqh
```

Conforme seu workflow anterior, sincronize o código via GitHub para o ambiente local antes de rodar os comandos.

### 2. Configurar o Webhook na Evolution API

Após o deploy, configure a Evolution API para enviar eventos para a URL correta:

```
https://ocfojfyiyzhnriorovqh.supabase.co/functions/v1/evolution-webhook
```

Na configuração da Evolution API (painel ou `.env`), defina:
- **Webhook URL**: `https://ocfojfyiyzhnriorovqh.supabase.co/functions/v1/evolution-webhook`
- **Eventos**: `messages.upsert`, `messages.update`, `connection.update`
- **Webhook por instância** ou **Global Webhook** — ambos funcionam, pois a function identifica a instância pelo campo `instance` do payload.

### 3. Verificar

Após o deploy, teste com um `curl`:
```
curl -X POST https://ocfojfyiyzhnriorovqh.supabase.co/functions/v1/evolution-webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"test","instance":"test","data":{}}'
```

Deve retornar `{"ok":true,"skipped":"instance not found"}` (status 200) — confirmando que a função está acessível.

## Nota sobre o código

Não há alterações de código necessárias. O problema é exclusivamente de infraestrutura (deploy).

