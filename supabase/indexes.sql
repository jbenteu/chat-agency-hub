-- ============================================
-- Indexes - Execute APÓS o schema.sql
-- ============================================

-- User Roles
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_tenant_id ON public.user_roles(tenant_id);
CREATE INDEX idx_user_roles_user_tenant ON public.user_roles(user_id, tenant_id);

-- Contacts
CREATE INDEX idx_contacts_tenant_id ON public.contacts(tenant_id);
CREATE INDEX idx_contacts_assigned_to ON public.contacts(assigned_to);
CREATE INDEX idx_contacts_email ON public.contacts(email);
CREATE INDEX idx_contacts_phone ON public.contacts(phone);
CREATE INDEX idx_contacts_tenant_created ON public.contacts(tenant_id, created_at DESC);

-- Deals
CREATE INDEX idx_deals_tenant_id ON public.deals(tenant_id);
CREATE INDEX idx_deals_contact_id ON public.deals(contact_id);
CREATE INDEX idx_deals_stage ON public.deals(tenant_id, stage);
CREATE INDEX idx_deals_status ON public.deals(tenant_id, status);
CREATE INDEX idx_deals_assigned_to ON public.deals(assigned_to);

-- Activities
CREATE INDEX idx_activities_tenant_id ON public.activities(tenant_id);
CREATE INDEX idx_activities_contact_id ON public.activities(contact_id);
CREATE INDEX idx_activities_deal_id ON public.activities(deal_id);
CREATE INDEX idx_activities_tenant_created ON public.activities(tenant_id, created_at DESC);

-- WhatsApp
CREATE INDEX idx_wa_instances_tenant ON public.whatsapp_instances(tenant_id);
CREATE INDEX idx_wa_conversations_tenant ON public.whatsapp_conversations(tenant_id);
CREATE INDEX idx_wa_conversations_instance ON public.whatsapp_conversations(instance_id);
CREATE INDEX idx_wa_conversations_remote_jid ON public.whatsapp_conversations(remote_jid);
CREATE INDEX idx_wa_conversations_last_msg ON public.whatsapp_conversations(tenant_id, last_message_at DESC);
CREATE INDEX idx_wa_messages_conversation ON public.whatsapp_messages(conversation_id);
CREATE INDEX idx_wa_messages_tenant_created ON public.whatsapp_messages(tenant_id, created_at DESC);

-- Pipeline & Tags
CREATE INDEX idx_pipeline_stages_tenant ON public.pipeline_stages(tenant_id, "order");
CREATE INDEX idx_tags_tenant ON public.tags(tenant_id);
CREATE INDEX idx_quick_replies_tenant ON public.quick_replies(tenant_id);
