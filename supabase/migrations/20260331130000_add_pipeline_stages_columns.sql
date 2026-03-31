-- Add missing columns to pipeline_stages table
ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_won BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Update existing stages with correct closed/won values
UPDATE public.pipeline_stages
  SET is_won = true, is_closed = true
  WHERE name ILIKE '%ganho%' OR name ILIKE '%won%' OR name ILIKE '%fechado%';

UPDATE public.pipeline_stages
  SET is_closed = true, is_won = false
  WHERE name ILIKE '%perdido%' OR name ILIKE '%lost%';
