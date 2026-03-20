CREATE OR REPLACE FUNCTION public.update_conversations_contact_names(p_tenant_id uuid, p_instance_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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