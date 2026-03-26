-- Reset stuck error/processing queue items so they get retried
UPDATE public.ai_analysis_queue
SET status = 'pending'
WHERE status IN ('error', 'processing');
