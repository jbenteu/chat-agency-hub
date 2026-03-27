-- Add new columns to deals table
ALTER TABLE deals ADD COLUMN IF NOT EXISTS priority text DEFAULT 'media';
ALTER TABLE deals ADD COLUMN IF NOT EXISTS expected_close_date date;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS loss_reason text;

-- Create deal_items table for products in a deal
CREATE TABLE IF NOT EXISTS deal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE deal_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage deal_items in their tenant"
  ON deal_items
  FOR ALL
  TO authenticated
  USING (tenant_id IN (SELECT user_accessible_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT user_accessible_tenant_ids()));

-- Fix existing deals with stage='lead' to use the first pipeline stage name of their tenant
UPDATE deals d
SET stage = (
  SELECT ps.name
  FROM pipeline_stages ps
  WHERE ps.tenant_id = d.tenant_id
  ORDER BY ps."order" ASC
  LIMIT 1
)
WHERE d.stage = 'lead'
  AND EXISTS (
    SELECT 1 FROM pipeline_stages ps WHERE ps.tenant_id = d.tenant_id
  );

-- Fix contacts without origin that have whatsapp conversations - set them to 'whatsapp'
UPDATE contacts c
SET origin = 'whatsapp'
WHERE c.origin IS NULL
  AND EXISTS (
    SELECT 1 FROM whatsapp_conversations wc WHERE wc.contact_id = c.id
  );
