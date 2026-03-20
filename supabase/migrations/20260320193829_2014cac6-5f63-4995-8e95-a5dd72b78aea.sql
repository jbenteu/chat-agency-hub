-- Delete all data belonging to test tenants (not the main operacional tenant)
-- Main tenant: c2012726-8204-4c6b-8038-6fd9335d72d5
-- Main user: d365d3c0-9992-45bf-8d72-d97cbbca6318

DELETE FROM whatsapp_messages WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM whatsapp_conversations WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM whatsapp_instances WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM ai_conversation_analysis WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM ai_analysis_queue WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM ai_dashboard_cache WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM activities WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM tasks WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM deals WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM contacts WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM pipeline_stages WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM tags WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM quick_replies WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM import_progress WHERE tenant_id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM invite_links WHERE created_by != 'd365d3c0-9992-45bf-8d72-d97cbbca6318';
DELETE FROM user_relationships;
DELETE FROM user_roles WHERE user_id != 'd365d3c0-9992-45bf-8d72-d97cbbca6318';
DELETE FROM tenants WHERE id != 'c2012726-8204-4c6b-8038-6fd9335d72d5';
DELETE FROM profiles WHERE id != 'd365d3c0-9992-45bf-8d72-d97cbbca6318';
DELETE FROM auth.users WHERE id != 'd365d3c0-9992-45bf-8d72-d97cbbca6318';