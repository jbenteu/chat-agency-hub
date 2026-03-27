-- AI Analysis Settings: provider config, model selection, API key, schedule
CREATE TABLE IF NOT EXISTS ai_analysis_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'anthropic', -- 'anthropic' | 'openai'
  analysis_model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  insights_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  api_key TEXT, -- user's own API key (overrides system env var if set)
  avg_ticket_brl NUMERIC(10,2) NOT NULL DEFAULT 2500,
  schedule_enabled BOOLEAN NOT NULL DEFAULT false,
  schedule_days INT[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 0=Sun...6=Sat
  schedule_hour INT NOT NULL DEFAULT 9, -- 0-23
  schedule_minute INT NOT NULL DEFAULT 0, -- 0-59
  schedule_timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_analysis_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_settings_tenant_isolation" ON ai_analysis_settings
  USING (tenant_id IN (SELECT unnest(user_accessible_tenant_ids())));

-- Helper: compute next scheduled run from settings
CREATE OR REPLACE FUNCTION compute_next_ai_run(
  p_days INT[],
  p_hour INT,
  p_minute INT,
  p_timezone TEXT
) RETURNS TIMESTAMPTZ LANGUAGE plpgsql AS $$
DECLARE
  v_now TIMESTAMPTZ;
  v_candidate TIMESTAMPTZ;
  v_day_offset INT;
  v_dow INT;
  v_found BOOL := false;
BEGIN
  v_now := NOW() AT TIME ZONE p_timezone;
  -- Try up to 8 days ahead
  FOR v_day_offset IN 0..7 LOOP
    v_candidate := (DATE_TRUNC('day', v_now) + v_day_offset * INTERVAL '1 day'
      + p_hour * INTERVAL '1 hour' + p_minute * INTERVAL '1 minute') AT TIME ZONE p_timezone;
    v_dow := EXTRACT(DOW FROM v_candidate AT TIME ZONE p_timezone)::INT;
    IF v_dow = ANY(p_days) AND v_candidate > NOW() THEN
      RETURN v_candidate;
    END IF;
  END LOOP;
  -- fallback: 7 days from now
  RETURN NOW() + INTERVAL '7 days';
END;
$$;
