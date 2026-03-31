-- Add gestor_id and cs_id columns to invite_links table
-- These columns allow pre-assigning a gestor and CS when inviting a client

ALTER TABLE public.invite_links
  ADD COLUMN IF NOT EXISTS gestor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cs_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
