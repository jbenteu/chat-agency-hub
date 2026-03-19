-- Update handle_new_user to also create a tenant and user_role for each new signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id uuid;
  user_name text;
  tenant_slug text;
BEGIN
  -- Determine a display name
  user_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  
  -- Create profile
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, user_name);

  -- Create a tenant for the new user
  tenant_slug := 'tenant-' || replace(NEW.id::text, '-', '');
  
  INSERT INTO public.tenants (name, slug)
  VALUES (user_name, tenant_slug)
  RETURNING id INTO new_tenant_id;

  -- Assign user as admin of their tenant
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'admin');

  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();