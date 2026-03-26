-- Add push_name to whatsapp_conversations for display name chain
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS push_name TEXT;

-- Add settings JSONB to whatsapp_instances (for importContacts, ignoreGroups, etc.)
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_push_name
  ON public.whatsapp_conversations (push_name)
  WHERE push_name IS NOT NULL;
