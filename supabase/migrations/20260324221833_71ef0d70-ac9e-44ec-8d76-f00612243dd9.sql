-- 1. Add assigned_to column to whatsapp_instances
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Index for the new column
CREATE INDEX IF NOT EXISTS idx_wa_instances_assigned_to
  ON public.whatsapp_instances(assigned_to);

-- 3. Helper function to check manager/admin status
CREATE OR REPLACE FUNCTION public.is_manager_or_above(p_user_id UUID, p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
      AND tenant_id = p_tenant_id
      AND role IN ('super_admin', 'admin', 'manager')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_manager_or_above FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_manager_or_above TO authenticated;