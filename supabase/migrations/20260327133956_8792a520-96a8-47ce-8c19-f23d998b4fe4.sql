
-- Add missing columns to deals
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS priority text DEFAULT 'media';
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS expected_close_date date;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS loss_reason text;

-- Create deal_items table
CREATE TABLE IF NOT EXISTS public.deal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deal_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for deal_items
CREATE POLICY "Tenant isolation for deal_items"
  ON public.deal_items
  FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id((SELECT auth.uid())));

CREATE POLICY "Tenant members can insert deal_items"
  ON public.deal_items
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id((SELECT auth.uid())));

CREATE POLICY "Tenant members can update deal_items"
  ON public.deal_items
  FOR UPDATE
  TO authenticated
  USING (tenant_id = get_user_tenant_id((SELECT auth.uid())));

CREATE POLICY "Tenant members can delete deal_items"
  ON public.deal_items
  FOR DELETE
  TO authenticated
  USING (tenant_id = get_user_tenant_id((SELECT auth.uid())));

-- Fix existing deals with stage = 'lead' → set to first pipeline stage name per tenant
UPDATE public.deals d
SET stage = ps.name
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, name
  FROM public.pipeline_stages
  ORDER BY tenant_id, "order" ASC
) ps
WHERE d.tenant_id = ps.tenant_id
  AND d.stage = 'lead';
