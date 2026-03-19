-- Fix existing users without tenants by creating tenants and roles for them
DO $$
DECLARE
  u RECORD;
  new_tenant_id uuid;
  user_name text;
  tenant_slug text;
BEGIN
  FOR u IN 
    SELECT au.id, au.email 
    FROM auth.users au
    LEFT JOIN public.user_roles ur ON ur.user_id = au.id
    WHERE ur.id IS NULL
  LOOP
    user_name := split_part(u.email, '@', 1);
    tenant_slug := 'tenant-' || replace(u.id::text, '-', '');
    
    INSERT INTO public.tenants (name, slug)
    VALUES (user_name, tenant_slug)
    RETURNING id INTO new_tenant_id;

    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (u.id, new_tenant_id, 'admin');
  END LOOP;
END;
$$;