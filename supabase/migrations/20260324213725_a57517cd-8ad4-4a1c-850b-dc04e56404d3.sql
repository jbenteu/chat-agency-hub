-- Tabela de atribuições: gestores gerenciam clientes específicos
CREATE TABLE IF NOT EXISTS public.tenant_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  UNIQUE (manager_id, tenant_id)
);

-- Tabela de análise de IA: resultados das análises de conversas
CREATE TABLE IF NOT EXISTS public.conversation_ai_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  analysis_type TEXT NOT NULL DEFAULT 'full',
  analysis_result JSONB NOT NULL DEFAULT '{}',
  sentiment_score DECIMAL(3, 2),
  lead_score INTEGER,
  key_insights TEXT[],
  action_items TEXT[],
  tags TEXT[],
  analyzed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_assignments_manager ON public.tenant_assignments(manager_id);
CREATE INDEX IF NOT EXISTS idx_tenant_assignments_tenant ON public.tenant_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversation_ai_conversation ON public.conversation_ai_analysis(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_ai_tenant ON public.conversation_ai_analysis(tenant_id);

-- RLS
ALTER TABLE public.tenant_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_ai_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers_view_own_assignments" ON public.tenant_assignments
  FOR SELECT TO authenticated
  USING (manager_id = (select auth.uid()));

CREATE POLICY "admins_manage_assignments" ON public.tenant_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = (select auth.uid()) AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "users_view_analyses" ON public.conversation_ai_analysis
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = (select auth.uid()))
    OR tenant_id IN (SELECT tenant_id FROM public.tenant_assignments WHERE manager_id = (select auth.uid()))
  );

CREATE POLICY "managers_create_analyses" ON public.conversation_ai_analysis
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = (select auth.uid())
      AND tenant_id = conversation_ai_analysis.tenant_id
      AND role IN ('admin', 'super_admin', 'manager')
    )
    OR EXISTS (
      SELECT 1 FROM public.tenant_assignments
      WHERE manager_id = (select auth.uid())
      AND tenant_id = conversation_ai_analysis.tenant_id
    )
  );

CREATE OR REPLACE VIEW public.conversation_analysis_summary AS
SELECT
  c.id as conversation_id,
  c.tenant_id,
  c.remote_jid,
  c.contact_name,
  c.contact_phone,
  c.last_message_at,
  c.status,
  ai.sentiment_score,
  ai.lead_score,
  ai.key_insights,
  ai.action_items,
  ai.analyzed_at,
  ai.analysis_result
FROM public.whatsapp_conversations c
LEFT JOIN LATERAL (
  SELECT * FROM public.conversation_ai_analysis
  WHERE conversation_id = c.id
  ORDER BY analyzed_at DESC
  LIMIT 1
) ai ON true;