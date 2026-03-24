DROP VIEW IF EXISTS public.conversation_analysis_summary;

CREATE VIEW public.conversation_analysis_summary
WITH (security_invoker = true)
AS
SELECT
  c.id as conversation_id,
  c.tenant_id,
  c.remote_jid,
  c.contact_name,
  c.contact_phone,
  c.last_message_at,
  c.status,
  ai.sentiment_score,
  ai.lead_score,
  ai.key_insights,
  ai.action_items,
  ai.analyzed_at,
  ai.analysis_result
FROM public.whatsapp_conversations c
LEFT JOIN LATERAL (
  SELECT * FROM public.conversation_ai_analysis
  WHERE conversation_id = c.id
  ORDER BY analyzed_at DESC
  LIMIT 1
) ai ON true;