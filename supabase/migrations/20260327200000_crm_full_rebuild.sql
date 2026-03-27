-- ============================================================
-- CRM FULL REBUILD MIGRATION
-- Adds: pipeline_stages enhancements, contacts native fields,
--       tasks table, custom_field_definitions table
-- ============================================================

-- ── 1. PIPELINE_STAGES enhancements ──────────────────────────
ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_won    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS icon      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

-- Mark existing stages by name convention
UPDATE public.pipeline_stages
SET is_closed = true, is_won = true, icon = 'Trophy'
WHERE lower(name) LIKE '%ganho%' OR lower(name) LIKE '%won%';

UPDATE public.pipeline_stages
SET is_closed = true, is_won = false, icon = 'XCircle'
WHERE lower(name) LIKE '%perdido%' OR lower(name) LIKE '%lost%';

-- Update icons for default stages
UPDATE public.pipeline_stages SET icon = 'UserPlus'
  WHERE lower(name) LIKE '%novo lead%' AND icon IS NULL;
UPDATE public.pipeline_stages SET icon = 'MessageCircle'
  WHERE lower(name) LIKE '%primeiro contato%' AND icon IS NULL;
UPDATE public.pipeline_stages SET icon = 'ClipboardCheck'
  WHERE lower(name) LIKE '%qualifica%' AND icon IS NULL;
UPDATE public.pipeline_stages SET icon = 'Handshake'
  WHERE lower(name) LIKE '%negocia%' AND icon IS NULL;

-- ── 2. CONTACTS native fields ─────────────────────────────────
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS birthday         DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gender           TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cpf              TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS instagram        TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source           TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_detail    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS zip_code         TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS score            INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_contact_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_stage  TEXT DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS lost_reason      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS avatar_url       TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pinned_note      TEXT DEFAULT NULL;

-- Migrate existing origin to source (keep backward compat)
UPDATE public.contacts SET source = origin WHERE source = 'manual' AND origin IS NOT NULL;

-- ── 3. TASKS table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id   UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id      UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  task_type    TEXT NOT NULL DEFAULT 'follow_up',
  due_date     TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  assigned_to  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  priority     TEXT DEFAULT 'medium',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_tenant_isolation"
  ON public.tasks FOR ALL TO authenticated
  USING (tenant_id IN (SELECT user_accessible_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT user_accessible_tenant_ids()));

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id   ON public.tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id  ON public.tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deal_id     ON public.tasks(deal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date    ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);

-- ── 4. CUSTOM_FIELD_DEFINITIONS table ────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type       TEXT NOT NULL DEFAULT 'contact',
  field_key         TEXT NOT NULL,
  field_label       TEXT NOT NULL,
  field_type        TEXT NOT NULL,
  field_options     JSONB DEFAULT '[]',
  is_required       BOOLEAN DEFAULT false,
  is_visible_kanban BOOLEAN DEFAULT false,
  is_visible_list   BOOLEAN DEFAULT false,
  "order"           INT DEFAULT 0,
  placeholder       TEXT DEFAULT NULL,
  default_value     TEXT DEFAULT NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, entity_type, field_key)
);

ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_field_definitions_tenant_isolation"
  ON public.custom_field_definitions FOR ALL TO authenticated
  USING (tenant_id IN (SELECT user_accessible_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT user_accessible_tenant_ids()));

CREATE INDEX IF NOT EXISTS idx_cfd_tenant_entity
  ON public.custom_field_definitions(tenant_id, entity_type);

-- ── 5. ACTIVITIES: add missing type support ───────────────────
-- Ensure activities supports 'task_completed', 'stage_change', 'note' types
-- (no schema change needed, just documentation of new types used)

-- ── 6. FUNCTION: seed default pipeline stages for new tenant ──
CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages(p_tenant_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.pipeline_stages
    (tenant_id, name, "order", color, is_closed, is_won, icon)
  VALUES
    (p_tenant_id, 'Novo Lead',        0, '#3B82F6', false, false, 'UserPlus'),
    (p_tenant_id, 'Primeiro Contato', 1, '#F59E0B', false, false, 'MessageCircle'),
    (p_tenant_id, 'Qualificação',     2, '#F97316', false, false, 'ClipboardCheck'),
    (p_tenant_id, 'Negociação',       3, '#8B5CF6', false, false, 'Handshake'),
    (p_tenant_id, 'Fechado/Ganho',    4, '#22C55E', true,  true,  'Trophy'),
    (p_tenant_id, 'Perdido',          5, '#EF4444', true,  false, 'XCircle')
  ON CONFLICT DO NOTHING;
END;
$$;

-- ── 7. FUNCTION: seed default custom fields for new tenant ────
CREATE OR REPLACE FUNCTION public.seed_default_custom_fields(p_tenant_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.custom_field_definitions
    (tenant_id, entity_type, field_key, field_label, field_type, field_options, "order")
  VALUES
    (p_tenant_id, 'contact', 'ring_size',       'Tamanho do Anel',    'text',   '[]', 0),
    (p_tenant_id, 'contact', 'preferred_metal',  'Metal Preferido',    'select',
      '["Ouro 18k","Ouro Branco","Prata","Rosé","Platina"]', 1),
    (p_tenant_id, 'contact', 'budget_range',     'Faixa de Orçamento', 'select',
      '["Até R$500","R$500-2000","R$2000-5000","R$5000-15000","Acima de R$15000"]', 2),
    (p_tenant_id, 'contact', 'occasion',         'Ocasião',            'select',
      '["Noivado","Casamento","Aniversário","Presente","Uso pessoal","Outro"]', 3),
    (p_tenant_id, 'contact', 'wedding_date',     'Data do Casamento',  'date',   '[]', 4),
    (p_tenant_id, 'contact', 'source_campaign',  'Campanha de Origem', 'text',   '[]', 5)
  ON CONFLICT (tenant_id, entity_type, field_key) DO NOTHING;
END;
$$;

-- ── 8. Trigger: auto-seed when pipeline_stages is empty ──────
-- (Existing use-pipeline.ts already handles this client-side, migration covers DB side)

-- ── 9. UPDATE DEALS: sync pipeline_stage_id for existing rows ─
UPDATE public.deals d
SET pipeline_stage_id = (
  SELECT ps.id FROM public.pipeline_stages ps
  WHERE ps.tenant_id = d.tenant_id
    AND ps.name = d.stage
  LIMIT 1
)
WHERE d.pipeline_stage_id IS NULL AND d.stage IS NOT NULL;

-- ── 10. INDEXES for performance ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle  ON public.contacts(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_contacts_source     ON public.contacts(source);
CREATE INDEX IF NOT EXISTS idx_contacts_score      ON public.contacts(score);
CREATE INDEX IF NOT EXISTS idx_contacts_birthday   ON public.contacts(birthday);
CREATE INDEX IF NOT EXISTS idx_deals_stage_id      ON public.deals(pipeline_stage_id);
