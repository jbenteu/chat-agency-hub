-- =============================================
-- Remove auto-created deals (0-value "Lead WhatsApp" deals)
-- These were being created automatically by the webhook for every
-- new WhatsApp contact, resulting in every lead showing a R$0 sale.
-- =============================================

DELETE FROM public.deals
WHERE (title ILIKE 'Lead WhatsApp%' OR title ILIKE 'Lead - %')
  AND (value IS NULL OR value = 0)
  AND status = 'open';
