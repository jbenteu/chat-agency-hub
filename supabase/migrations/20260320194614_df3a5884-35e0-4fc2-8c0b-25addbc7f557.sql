
-- =============================================
-- FIX 1: profiles RLS - replace "view all" with scoped policy
-- =============================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

-- Create a security definer function to check profile visibility
CREATE OR REPLACE FUNCTION public.can_view_profile(_viewer_id uuid, _target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    _viewer_id = _target_id
    OR EXISTS (
      SELECT 1 FROM public.user_relationships
      WHERE superior_id = _viewer_id AND subordinate_id = _target_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_relationships
      WHERE subordinate_id = _viewer_id AND superior_id = _target_id
    )
$$;

-- New scoped policy
CREATE POLICY "Users can view related profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.can_view_profile((select auth.uid()), id));

-- Drop the old "own profile" policy (now covered by the new one)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Fix update policy performance
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()));

-- =============================================
-- FIX 2: invite_links INSERT - restrict to non-cliente
-- =============================================

DROP POLICY IF EXISTS "Users can create invite links" ON public.invite_links;
CREATE POLICY "Non-cliente users can create invite links"
  ON public.invite_links FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (select auth.uid())
      AND role != 'cliente'
    )
  );

-- Fix SELECT policy performance
DROP POLICY IF EXISTS "Users can view own invite links" ON public.invite_links;
CREATE POLICY "Users can view own invite links"
  ON public.invite_links FOR SELECT
  TO authenticated
  USING (created_by = (select auth.uid()));

-- =============================================
-- FIX 3: user_relationships - use profiles.role instead of app_role
-- =============================================

DROP POLICY IF EXISTS "Admins can manage relationships" ON public.user_relationships;

CREATE OR REPLACE FUNCTION public.is_profile_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = 'admin'
  )
$$;

CREATE POLICY "Admins can manage relationships"
  ON public.user_relationships FOR ALL
  TO authenticated
  USING (public.is_profile_admin((select auth.uid())))
  WITH CHECK (public.is_profile_admin((select auth.uid())));

-- Fix SELECT policy performance
DROP POLICY IF EXISTS "Users can view their relationships" ON public.user_relationships;
CREATE POLICY "Users can view their relationships"
  ON public.user_relationships FOR SELECT
  TO authenticated
  USING (superior_id = (select auth.uid()) OR subordinate_id = (select auth.uid()));

-- =============================================
-- FIX 4 & 5: All tables - (select auth.uid()), remove duplicates
-- =============================================

-- === TENANTS ===
DROP POLICY IF EXISTS "Users can view their tenant" ON public.tenants;
CREATE POLICY "Users can view their tenant"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = (select auth.uid())));

-- === USER_ROLES ===
DROP POLICY IF EXISTS "Users can view roles in their tenant" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Users can view roles in their tenant"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles ur WHERE ur.user_id = (select auth.uid())));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (
    public.has_role((select auth.uid()), tenant_id, 'admin')
    OR public.has_role((select auth.uid()), tenant_id, 'super_admin')
  );

-- === CONTACTS ===
DROP POLICY IF EXISTS "Tenant isolation for contacts" ON public.contacts;
DROP POLICY IF EXISTS "Tenant members can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Tenant members can update contacts" ON public.contacts;
DROP POLICY IF EXISTS "Admins can delete contacts" ON public.contacts;

CREATE POLICY "Tenant isolation for contacts"
  ON public.contacts FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Tenant members can insert contacts"
  ON public.contacts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Tenant members can update contacts"
  ON public.contacts FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Admins can delete contacts"
  ON public.contacts FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    AND (
      public.has_role((select auth.uid()), tenant_id, 'admin')
      OR public.has_role((select auth.uid()), tenant_id, 'super_admin')
      OR public.has_role((select auth.uid()), tenant_id, 'manager')
    )
  );

-- === DEALS ===
DROP POLICY IF EXISTS "Tenant isolation for deals" ON public.deals;
DROP POLICY IF EXISTS "Tenant members can insert deals" ON public.deals;
DROP POLICY IF EXISTS "Tenant members can update deals" ON public.deals;
DROP POLICY IF EXISTS "Admins can delete deals" ON public.deals;

CREATE POLICY "Tenant isolation for deals"
  ON public.deals FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Tenant members can insert deals"
  ON public.deals FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Tenant members can update deals"
  ON public.deals FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Admins can delete deals"
  ON public.deals FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    AND (public.has_role((select auth.uid()), tenant_id, 'admin') OR public.has_role((select auth.uid()), tenant_id, 'super_admin'))
  );

-- === ACTIVITIES ===
DROP POLICY IF EXISTS "Tenant isolation for activities" ON public.activities;
DROP POLICY IF EXISTS "Tenant members can insert activities" ON public.activities;

CREATE POLICY "Tenant isolation for activities"
  ON public.activities FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Tenant members can insert activities"
  ON public.activities FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- === TASKS ===
DROP POLICY IF EXISTS "Tenant isolation for tasks" ON public.tasks;
DROP POLICY IF EXISTS "Tenant members can insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Tenant members can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins can delete tasks" ON public.tasks;

CREATE POLICY "Tenant isolation for tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Tenant members can insert tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Tenant members can update tasks"
  ON public.tasks FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Admins can delete tasks"
  ON public.tasks FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    AND (public.has_role((select auth.uid()), tenant_id, 'admin') OR public.has_role((select auth.uid()), tenant_id, 'super_admin') OR public.has_role((select auth.uid()), tenant_id, 'manager'))
  );

-- === AI_ANALYSIS_QUEUE (remove duplicates) ===
DROP POLICY IF EXISTS "Tenant members can view ai_queue" ON public.ai_analysis_queue;
DROP POLICY IF EXISTS "tenant_isolation_ai_queue" ON public.ai_analysis_queue;

CREATE POLICY "Tenant isolation for ai_analysis_queue"
  ON public.ai_analysis_queue FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = (select auth.uid())));

-- === AI_CONVERSATION_ANALYSIS (remove duplicates) ===
DROP POLICY IF EXISTS "Tenant members can view ai_analysis" ON public.ai_conversation_analysis;
DROP POLICY IF EXISTS "tenant_isolation_ai_analysis" ON public.ai_conversation_analysis;

CREATE POLICY "Tenant isolation for ai_conversation_analysis"
  ON public.ai_conversation_analysis FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = (select auth.uid())));

-- === AI_DASHBOARD_CACHE (remove duplicates) ===
DROP POLICY IF EXISTS "Tenant members can view ai_cache" ON public.ai_dashboard_cache;
DROP POLICY IF EXISTS "tenant_isolation_ai_cache" ON public.ai_dashboard_cache;

CREATE POLICY "Tenant isolation for ai_dashboard_cache"
  ON public.ai_dashboard_cache FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = (select auth.uid())));

-- === WHATSAPP_INSTANCES (remove duplicates) ===
DROP POLICY IF EXISTS "Tenant isolation for whatsapp_instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Admins can manage whatsapp_instances" ON public.whatsapp_instances;

CREATE POLICY "Tenant isolation for whatsapp_instances"
  ON public.whatsapp_instances FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Admins can manage whatsapp_instances"
  ON public.whatsapp_instances FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    AND (public.has_role((select auth.uid()), tenant_id, 'admin') OR public.has_role((select auth.uid()), tenant_id, 'super_admin'))
  );

-- === WHATSAPP_CONVERSATIONS (remove duplicates) ===
DROP POLICY IF EXISTS "Tenant isolation for whatsapp_conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Tenant members can manage conversations" ON public.whatsapp_conversations;

CREATE POLICY "Tenant isolation for whatsapp_conversations"
  ON public.whatsapp_conversations FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- === WHATSAPP_MESSAGES ===
DROP POLICY IF EXISTS "Tenant isolation for whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Tenant members can insert messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Tenant members can update messages" ON public.whatsapp_messages;

CREATE POLICY "Tenant isolation for whatsapp_messages"
  ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Tenant members can insert messages"
  ON public.whatsapp_messages FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Tenant members can update messages"
  ON public.whatsapp_messages FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- === PIPELINE_STAGES (remove duplicates) ===
DROP POLICY IF EXISTS "Tenant isolation for pipeline_stages" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Admins can manage pipeline_stages" ON public.pipeline_stages;

CREATE POLICY "Tenant isolation for pipeline_stages"
  ON public.pipeline_stages FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

CREATE POLICY "Admins can manage pipeline_stages"
  ON public.pipeline_stages FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id((select auth.uid()))
    AND (public.has_role((select auth.uid()), tenant_id, 'admin') OR public.has_role((select auth.uid()), tenant_id, 'super_admin'))
  );

-- === TAGS (remove duplicates) ===
DROP POLICY IF EXISTS "Tenant isolation for tags" ON public.tags;
DROP POLICY IF EXISTS "Tenant members can manage tags" ON public.tags;

CREATE POLICY "Tenant isolation for tags"
  ON public.tags FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- === QUICK_REPLIES (remove duplicates) ===
DROP POLICY IF EXISTS "Tenant isolation for quick_replies" ON public.quick_replies;
DROP POLICY IF EXISTS "Tenant members can manage quick_replies" ON public.quick_replies;

CREATE POLICY "Tenant isolation for quick_replies"
  ON public.quick_replies FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- === IMPORT_PROGRESS ===
DROP POLICY IF EXISTS "tenant_isolation_import_progress" ON public.import_progress;

CREATE POLICY "Tenant isolation for import_progress"
  ON public.import_progress FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id((select auth.uid())));

-- =============================================
-- FIX 6: Remove duplicate index
-- =============================================
DROP INDEX IF EXISTS idx_ai_analysis_tenant_date;
