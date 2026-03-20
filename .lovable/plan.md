

## Implementar Upload de Foto de Perfil

### Situacao Atual
O botao "Alterar foto" em `/configuracoes` esta desabilitado (`disabled`). Nao existe bucket de Storage nem logica de upload.

### Plano

**1. Criar bucket `avatars` no Supabase Storage (migration SQL)**
- Bucket publico para leitura
- RLS: usuarios autenticados podem fazer upload/update/delete apenas no proprio path (`{user_id}/`)

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Public avatar read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');
```

**2. Atualizar `Settings.tsx`**
- Habilitar o botao "Alterar foto"
- Adicionar `<input type="file" accept="image/*">` oculto, acionado pelo botao
- Preview da imagem antes de salvar
- Ao salvar: upload para `avatars/{user_id}/profile.{ext}` via Supabase Storage SDK
- Atualizar `profiles.avatar_url` com a URL publica
- Chamar `refreshProfile()` para atualizar o avatar no sidebar

**3. Arquivos afetados**
- Nova migration SQL (bucket + policies)
- `src/pages/Settings.tsx` (logica de upload e preview)

