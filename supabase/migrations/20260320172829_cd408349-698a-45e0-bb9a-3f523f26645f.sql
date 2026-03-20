-- 1. Deduplicate contacts: keep most recent per phone+tenant
DELETE FROM public.contacts a
USING public.contacts b
WHERE a.phone IS NOT NULL
  AND a.phone = b.phone
  AND a.tenant_id = b.tenant_id
  AND a.created_at < b.created_at;

-- 2. Add unique constraint on (phone, tenant_id) for upsert to work
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_phone_tenant_unique
  ON public.contacts (phone, tenant_id)
  WHERE phone IS NOT NULL;

-- 3. Fix RPC to use instance_id via JOIN instead of nonexistent instance_name column
CREATE OR REPLACE FUNCTION public.update_conversations_contact_names(p_tenant_id uuid, p_instance_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE whatsapp_conversations wc
  SET 
    contact_name = c.name,
    contact_id = c.id
  FROM contacts c
  JOIN whatsapp_instances wi ON wi.tenant_id = c.tenant_id
  WHERE 
    wc.tenant_id = p_tenant_id
    AND wi.instance_name = p_instance_name
    AND wc.instance_id = wi.id
    AND c.tenant_id = p_tenant_id
    AND c.phone IS NOT NULL
    AND c.phone = regexp_replace(split_part(wc.remote_jid, '@', 1), '\D', '', 'g')
    AND c.name IS NOT NULL
    AND c.name != ''
    AND (wc.contact_name IS NULL 
         OR wc.contact_name = regexp_replace(split_part(wc.remote_jid, '@', 1), '\D', '', 'g'));
END;
$function$;