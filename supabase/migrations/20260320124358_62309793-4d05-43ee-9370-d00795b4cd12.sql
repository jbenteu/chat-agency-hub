
-- Phase 1A: Add new columns to whatsapp_conversations
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS typing_presence text,
  ADD COLUMN IF NOT EXISTS typing_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS muted_until timestamptz;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_archived
  ON public.whatsapp_conversations (tenant_id, archived);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_pinned
  ON public.whatsapp_conversations (tenant_id, pinned);

-- Full-text search index on messages content
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_content_search
  ON public.whatsapp_messages USING gin (to_tsvector('portuguese', COALESCE(content, '')));

-- Allow tenant members to UPDATE messages (needed for reactions metadata, delete flags)
CREATE POLICY "Tenant members can update messages"
  ON public.whatsapp_messages
  FOR UPDATE
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));
