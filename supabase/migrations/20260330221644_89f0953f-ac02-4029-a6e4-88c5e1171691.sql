
-- Drop the recursive policy
DROP POLICY IF EXISTS "Users can view roles in their tenant" ON public.user_roles;

-- Create a security definer function to get user's tenant IDs from user_roles without triggering RLS
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.user_roles WHERE user_id = _user_id;
$$;

-- Recreate the policy using the security definer function
CREATE POLICY "Users can view roles in their tenant"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT public.get_user_tenant_ids((SELECT auth.uid()))));
