-- ============================================================
-- AI Analysis Refactor: global settings + run history
-- ============================================================

-- 1. Global AI system settings (singleton — one row for the whole platform)
CREATE TABLE IF NOT EXISTS ai_system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'anthropic',
  analysis_model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  insights_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  api_key TEXT,
  avg_ticket_brl NUMERIC(10,2) NOT NULL DEFAULT 2500,
  schedule_enabled BOOLEAN NOT NULL DEFAULT false,
  schedule_days INT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  schedule_hour INT NOT NULL DEFAULT 8,
  schedule_minute INT NOT NULL DEFAULT 0,
  schedule_timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  max_history_runs INT NOT NULL DEFAULT 10,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce only one row
CREATE UNIQUE INDEX IF NOT EXISTS ai_system_settings_singleton ON ai_system_settings ((true));

-- Seed default row
INSERT INTO ai_system_settings DEFAULT VALUES ON CONFLICT DO NOTHING;

ALTER TABLE ai_system_settings ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read (used by edge functions via service role, but also direct reads)
CREATE POLICY "ai_system_settings_select" ON ai_system_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admins can write via direct client (edge functions use service role which bypasses RLS)
CREATE POLICY "ai_system_settings_admin_write" ON ai_system_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );


-- 2. Analysis run history (one record per run per tenant)
CREATE TABLE IF NOT EXISTS ai_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triggered_by TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'manual'
  triggered_by_user_id UUID,
  status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'error'
  conversations_analyzed INT NOT NULL DEFAULT 0,
  conversations_total INT NOT NULL DEFAULT 0,
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_analysis_runs_tenant_run_at_idx
  ON ai_analysis_runs (tenant_id, run_at DESC);

ALTER TABLE ai_analysis_runs ENABLE ROW LEVEL SECURITY;

-- Users can see runs for their tenant (or accessible tenants via user_roles)
CREATE POLICY "ai_runs_select" ON ai_analysis_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = ai_analysis_runs.tenant_id
    )
  );


-- 3. Link each conversation analysis to the run that produced it
ALTER TABLE ai_conversation_analysis
  ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES ai_analysis_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ai_conv_analysis_run_id_idx
  ON ai_conversation_analysis (run_id)
  WHERE run_id IS NOT NULL;
