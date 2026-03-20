
-- Create user_role enum
CREATE TYPE public.user_role AS ENUM ('admin', 'gerente', 'gestor', 'sucesso_cliente', 'cliente');

-- Add columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS role public.user_role DEFAULT 'cliente',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Backfill email from auth.users
UPDATE public.profiles p SET email = u.email FROM auth.users u WHERE p.id = u.id AND p.email IS NULL;

-- Backfill role: map existing admin user_roles to admin
UPDATE public.profiles p SET role = 'admin'
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin'
);

-- Create user_relationships table
CREATE TABLE public.user_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  superior_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subordinate_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(superior_id, subordinate_id)
);
ALTER TABLE public.user_relationships ENABLE ROW LEVEL SECURITY;

-- Create invite_links table
CREATE TABLE public.invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  role_to_assign public.user_role NOT NULL,
  used boolean DEFAULT false,
  used_by uuid REFERENCES public.profiles(id),
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.invite_links ENABLE ROW LEVEL SECURITY;

-- Add owner_id and is_personal to whatsapp_instances
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS is_personal boolean DEFAULT false;

-- RLS for user_relationships
CREATE POLICY "Users can view their relationships"
  ON public.user_relationships FOR SELECT TO authenticated
  USING (superior_id = auth.uid() OR subordinate_id = auth.uid());

-- RLS for invite_links
CREATE POLICY "Users can view own invite links"
  ON public.invite_links FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can create invite links"
  ON public.invite_links FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Allow all profiles to be viewable by authenticated users (needed for team/client views via edge functions)
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- Update handle_new_user to support invite flow (ON CONFLICT)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id uuid;
  user_name text;
  tenant_slug text;
BEGIN
  user_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (NEW.id, user_name, NEW.email, 'cliente')
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(public.profiles.email, EXCLUDED.email);

  tenant_slug := 'tenant-' || replace(NEW.id::text, '-', '');
  
  INSERT INTO public.tenants (name, slug)
  VALUES (user_name, tenant_slug)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'admin');

  RETURN NEW;
END;
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_relationships_superior ON public.user_relationships(superior_id);
CREATE INDEX IF NOT EXISTS idx_user_relationships_subordinate ON public.user_relationships(subordinate_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_token ON public.invite_links(token);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_created_by ON public.profiles(created_by);
