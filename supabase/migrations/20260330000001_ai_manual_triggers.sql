-- Add manual trigger controls to ai_system_settings
ALTER TABLE ai_system_settings
  ADD COLUMN IF NOT EXISTS allow_manual_triggers BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_triggers_per_period INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trigger_period_days INT NOT NULL DEFAULT 30;

-- 0 means unlimited
COMMENT ON COLUMN ai_system_settings.max_triggers_per_period IS 'Maximum manual triggers allowed per period. 0 = unlimited.';
COMMENT ON COLUMN ai_system_settings.trigger_period_days IS 'Period in days for counting manual trigger usage.';
