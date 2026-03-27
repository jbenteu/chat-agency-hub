
-- Allow tenant members (admin/manager) to update their own tenant settings
CREATE POLICY "Tenant admins can update tenant settings"
ON public.tenants FOR UPDATE
TO authenticated
USING (id = get_user_tenant_id(auth.uid()))
WITH CHECK (id = get_user_tenant_id(auth.uid()));

-- Create custom_field_definitions table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'contact',
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  field_options text[] DEFAULT '{}',
  is_required boolean DEFAULT false,
  is_visible_kanban boolean DEFAULT false,
  is_visible_list boolean DEFAULT false,
  "order" integer DEFAULT 0,
  placeholder text,
  default_value text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, entity_type, field_key)
);

ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for custom_field_definitions"
ON public.custom_field_definitions FOR ALL
TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()))
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
