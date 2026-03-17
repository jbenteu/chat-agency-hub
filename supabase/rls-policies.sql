-- ============================================
-- RLS Policies - Execute APÓS o schema.sql
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

-- ========== PROFILES ==========
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- ========== TENANTS ==========
CREATE POLICY "Users can view their tenant"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- ========== USER ROLES ==========
CREATE POLICY "Users can view roles in their tenant"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), tenant_id, 'admin')
    OR public.has_role(auth.uid(), tenant_id, 'super_admin')
  );

-- ========== TENANT-SCOPED TABLES (contacts, deals, activities, etc.) ==========

-- Helper macro: tenant isolation
-- Users can only see data from their tenant

-- CONTACTS
CREATE POLICY "Tenant isolation for contacts"
  ON public.contacts FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can insert contacts"
  ON public.contacts FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can update contacts"
  ON public.contacts FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can delete contacts"
  ON public.contacts FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), tenant_id, 'admin')
      OR public.has_role(auth.uid(), tenant_id, 'super_admin')
      OR public.has_role(auth.uid(), tenant_id, 'manager')
    )
  );

-- DEALS
CREATE POLICY "Tenant isolation for deals"
  ON public.deals FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can insert deals"
  ON public.deals FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can update deals"
  ON public.deals FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can delete deals"
  ON public.deals FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), tenant_id, 'admin') OR public.has_role(auth.uid(), tenant_id, 'super_admin'))
  );

-- ACTIVITIES
CREATE POLICY "Tenant isolation for activities"
  ON public.activities FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can insert activities"
  ON public.activities FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- WHATSAPP INSTANCES
CREATE POLICY "Tenant isolation for whatsapp_instances"
  ON public.whatsapp_instances FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage whatsapp_instances"
  ON public.whatsapp_instances FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), tenant_id, 'admin') OR public.has_role(auth.uid(), tenant_id, 'super_admin'))
  );

-- WHATSAPP CONVERSATIONS
CREATE POLICY "Tenant isolation for whatsapp_conversations"
  ON public.whatsapp_conversations FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage conversations"
  ON public.whatsapp_conversations FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- WHATSAPP MESSAGES
CREATE POLICY "Tenant isolation for whatsapp_messages"
  ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can insert messages"
  ON public.whatsapp_messages FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- PIPELINE STAGES
CREATE POLICY "Tenant isolation for pipeline_stages"
  ON public.pipeline_stages FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage pipeline_stages"
  ON public.pipeline_stages FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), tenant_id, 'admin') OR public.has_role(auth.uid(), tenant_id, 'super_admin'))
  );

-- TAGS
CREATE POLICY "Tenant isolation for tags"
  ON public.tags FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage tags"
  ON public.tags FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- QUICK REPLIES
CREATE POLICY "Tenant isolation for quick_replies"
  ON public.quick_replies FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage quick_replies"
  ON public.quick_replies FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
