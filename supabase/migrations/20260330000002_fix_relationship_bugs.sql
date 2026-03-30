-- =============================================
-- Fix 1: tenant_assignments RLS
-- Remove dependency on user_roles (causes infinite recursion).
-- Use profiles.role instead (SECURITY DEFINER safe).
-- Grant INSERT/UPDATE/DELETE to admins AND gerentes.
-- =============================================

DROP POLICY IF EXISTS "admins_manage_assignments" ON public.tenant_assignments;
DROP POLICY IF EXISTS "managers_view_own_assignments" ON public.tenant_assignments;

-- Gestores/CS see their own assignments; admins and gerentes see all
CREATE POLICY "view_assignments"
  ON public.tenant_assignments FOR SELECT TO authenticated
  USING (
    manager_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'gerente')
    )
  );

-- Only admins and gerentes can create assignments
CREATE POLICY "insert_assignments"
  ON public.tenant_assignments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'gerente')
    )
  );

-- Only admins and gerentes can update assignments
CREATE POLICY "update_assignments"
  ON public.tenant_assignments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'gerente')
    )
  );

-- Only admins and gerentes can delete assignments
CREATE POLICY "delete_assignments"
  ON public.tenant_assignments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'gerente')
    )
  );

-- =============================================
-- Fix 2: tenants visibility for admins and gerentes
-- They need to see ALL tenants for the assignment dialog.
-- =============================================

CREATE POLICY IF NOT EXISTS "Admins and gerentes view all tenants"
  ON public.tenants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (select auth.uid()) AND role IN ('admin', 'gerente')
    )
  );

-- =============================================
-- Fix 3: Add gestor_id and cs_id to invite_links
-- Allows pre-assigning a Gestor and CS when creating a cliente invite.
-- =============================================

ALTER TABLE public.invite_links
  ADD COLUMN IF NOT EXISTS gestor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cs_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- =============================================
-- Fix 4: Update can_view_profile
-- - Admins and gerentes can see all profiles.
-- - Non-cliente staff can see other non-cliente profiles
--   (needed for gestor/cs dropdowns in invite dialog).
-- =============================================

CREATE OR REPLACE FUNCTION public.can_view_profile(_viewer_id uuid, _target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Own profile
    _viewer_id = _target_id

    -- Admins and gerentes can see everyone
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _viewer_id AND p.role IN ('admin', 'gerente')
    )

    -- Non-cliente staff can see other non-cliente staff
    -- (needed for invite dropdowns, team management, etc.)
    OR (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = _viewer_id AND role NOT IN ('cliente'))
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = _target_id AND role NOT IN ('cliente'))
    )

    -- Can see direct reports (subordinates)
    OR EXISTS (
      SELECT 1 FROM public.user_relationships
      WHERE superior_id = _viewer_id AND subordinate_id = _target_id
    )

    -- Can see your superiors
    OR EXISTS (
      SELECT 1 FROM public.user_relationships
      WHERE subordinate_id = _viewer_id AND superior_id = _target_id
    )
$$;

-- =============================================
-- Fix 5: user_relationships - gerentes can also manage relationships
-- (currently only admins can; gerentes need this to link gestores to clients)
-- =============================================

DROP POLICY IF EXISTS "Admins can manage relationships" ON public.user_relationships;

CREATE POLICY "Admins and gerentes can manage relationships"
  ON public.user_relationships FOR ALL TO authenticated
  USING (
    public.is_profile_admin((select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (select auth.uid()) AND role = 'gerente'
    )
  )
  WITH CHECK (
    public.is_profile_admin((select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (select auth.uid()) AND role = 'gerente'
    )
  );
