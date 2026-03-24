
-- 1. Create security definer function to get accessible tenant IDs
CREATE OR REPLACE FUNCTION public.user_accessible_tenant_ids()
RETURNS TABLE(tenant_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Own tenant
  SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  UNION
  -- Assigned tenants via tenant_assignments
  SELECT ta.tenant_id FROM public.tenant_assignments ta WHERE ta.manager_id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.user_accessible_tenant_ids FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_accessible_tenant_ids TO authenticated;

-- 2. Add SELECT policy on whatsapp_conversations for assigned tenants
CREATE POLICY "Assigned managers can view conversations"
ON public.whatsapp_conversations FOR SELECT TO authenticated
USING (tenant_id IN (SELECT user_accessible_tenant_ids()));

-- 3. Add SELECT policy on whatsapp_instances for assigned tenants
CREATE POLICY "Assigned managers can view instances"
ON public.whatsapp_instances FOR SELECT TO authenticated
USING (tenant_id IN (SELECT user_accessible_tenant_ids()));

-- 4. Add SELECT policy on whatsapp_messages for assigned tenants
CREATE POLICY "Assigned managers can view messages"
ON public.whatsapp_messages FOR SELECT TO authenticated
USING (tenant_id IN (SELECT user_accessible_tenant_ids()));

-- 5. Add SELECT policy on tenants for assigned tenants
CREATE POLICY "Assigned managers can view tenants"
ON public.tenants FOR SELECT TO authenticated
USING (id IN (SELECT user_accessible_tenant_ids()));
