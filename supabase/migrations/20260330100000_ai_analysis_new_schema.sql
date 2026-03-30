-- ============================================================
-- AI Analysis New Schema: conversations, improvements, schedule, message log
-- ============================================================

-- 1. Add missing columns to ai_analysis_runs (already exists but needs more fields)
ALTER TABLE public.ai_analysis_runs
  ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS messages_analyzed INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Rename columns to new naming if needed (status values were different)
-- status already exists as TEXT, just ensure new values are accepted
-- 'running' -> 'processing' for compatibility
UPDATE public.ai_analysis_runs SET status = 'completed' WHERE status = 'completed';
UPDATE public.ai_analysis_runs SET status = 'processing' WHERE status = 'running';

-- Add completed_at if not exists
ALTER TABLE public.ai_analysis_runs
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 2. Table: ai_analysis_conversations
CREATE TABLE IF NOT EXISTS public.ai_analysis_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.ai_analysis_runs(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  messages_count INT DEFAULT 0,
  score_response_time NUMERIC(3,1),
  score_empathy NUMERIC(3,1),
  score_product_knowledge NUMERIC(3,1),
  score_objection_handling NUMERIC(3,1),
  score_closing_technique NUMERIC(3,1),
  score_follow_up NUMERIC(3,1),
  score_overall NUMERIC(3,1),
  details JSONB DEFAULT '{}',
  improvement_points JSONB DEFAULT '[]',
  positive_points JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_analysis_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_analysis_conversations_select" ON public.ai_analysis_conversations
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ai_analysis_conversations_admin_write" ON public.ai_analysis_conversations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = ai_analysis_conversations.tenant_id
        AND role IN ('admin', 'super_admin')
    )
  );

-- 3. Table: ai_analysis_improvements
CREATE TABLE IF NOT EXISTS public.ai_analysis_improvements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.ai_analysis_runs(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  occurrence_count INT DEFAULT 1,
  example_refs JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_analysis_improvements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_analysis_improvements_select" ON public.ai_analysis_improvements
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ai_analysis_improvements_admin_write" ON public.ai_analysis_improvements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = ai_analysis_improvements.tenant_id
        AND role IN ('admin', 'super_admin')
    )
  );

-- 4. Table: ai_analysis_schedule
CREATE TABLE IF NOT EXISTS public.ai_analysis_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT true,
  frequency TEXT NOT NULL DEFAULT 'weekly',
  day_of_week INT DEFAULT 1,
  time_of_day TIME DEFAULT '08:00:00',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_analysis_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_analysis_schedule_select" ON public.ai_analysis_schedule
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ai_analysis_schedule_admin_write" ON public.ai_analysis_schedule
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = ai_analysis_schedule.tenant_id
        AND role IN ('admin', 'super_admin')
    )
  );

-- 5. Table: ai_analysis_message_log
CREATE TABLE IF NOT EXISTS public.ai_analysis_message_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  run_id UUID REFERENCES public.ai_analysis_runs(id) ON DELETE CASCADE NOT NULL,
  message_id UUID REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, message_id)
);

ALTER TABLE public.ai_analysis_message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_analysis_message_log_select" ON public.ai_analysis_message_log
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  );

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_analysis_runs_tenant_status ON public.ai_analysis_runs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_tenant_period ON public.ai_analysis_runs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_conversations_run ON public.ai_analysis_conversations(run_id);
CREATE INDEX IF NOT EXISTS idx_analysis_conversations_tenant ON public.ai_analysis_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_analysis_improvements_run ON public.ai_analysis_improvements(run_id);
CREATE INDEX IF NOT EXISTS idx_analysis_message_log_tenant ON public.ai_analysis_message_log(tenant_id, message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_created ON public.whatsapp_messages(tenant_id, created_at DESC);
