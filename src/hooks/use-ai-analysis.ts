import { supabase } from "@/integrations/supabase/client";

export interface AIConversationAnalysis {
  id: string;
  conversation_id: string;
  tenant_id: string;
  sentimento: 'positivo' | 'neutro' | 'frustrado' | null;
  produto_interesse: string | null;
  objecao_detectada: string | null;
  score_qualidade: number | null;
  score_empatia: number | null;
  score_clareza: number | null;
  score_velocidade: number | null;
  score_followup: number | null;
  score_contorno_objecao: number | null;
  score_cta: number | null;
  score_personalizacao: number | null;
  status_lead: 'quente' | 'morno' | 'frio' | 'perdido' | null;
  horas_sem_resposta: number | null;
  resumo: string | null;
  analyzed_at: string;
}

export interface AIDashboardData {
  total_conversas_mes: number;
  leads_sem_resposta: number;
  score_medio: number | null;
  top_produtos: Array<{ produto_interesse: string; count: number }>;
  top_objecoes: Array<{ objecao_detectada: string; count: number }>;
  leads_por_status: Record<string, number>;
  media_scores: {
    empatia: number | null;
    clareza: number | null;
    velocidade: number | null;
    followup: number | null;
    contorno_objecao: number | null;
    cta: number | null;
    personalizacao: number | null;
  };
  leads_sem_resposta_lista: Array<{
    id: string;
    contact_name: string | null;
    contact_phone: string | null;
    last_message: string | null;
    last_message_at: string;
    horas_sem_resposta: number;
    produto_interesse: string | null;
    objecao_detectada: string | null;
    status_lead: string | null;
  }>;
  melhores_abordagens: Array<{
    contact_name: string | null;
    last_message: string | null;
    produto_interesse: string | null;
    score_qualidade: number;
    resumo: string | null;
  }>;
}

export interface WhatsAppInstance {
  id: string;
  instance_name: string;
  display_name: string | null;
  status: string;
  phone_number: string | null;
}

export interface AnalysisStatus {
  total_conversations: number;
  analyzed_conversations: number;
  coverage_pct: number;
}

export interface AIInsight {
  tipo: 'urgente' | 'oportunidade' | 'alerta' | 'tendencia';
  titulo: string;
  descricao: string;
  acao: string;
}

export interface TemporalPattern {
  hours: Array<{
    hour: number;
    label: string;
    inbound: number;
    outbound: number;
    total: number;
  }>;
  days: Array<{
    day: number;
    label: string;
    inbound: number;
    outbound: number;
    total: number;
  }>;
  peak_inbound_hour: number;
  peak_outbound_hour: number;
  total_messages: number;
}

export interface PipelineLead {
  conversation_id: string;
  status_lead: string;
  produto_interesse: string | null;
  objecao_detectada: string | null;
  score_qualidade: number | null;
  horas_sem_resposta: number;
  resumo: string | null;
  sentimento: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  last_message: string | null;
  last_message_at: string | null;
}

export interface AccessibleTenant {
  id: string;
  name: string;
  instances: Array<{ id: string; display_name: string | null; instance_name: string; status: string }>;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  tenant_ids: string[];
}

const invokeAI = async (action: string, payload: object) => {
  const { data, error } = await supabase.functions.invoke("ai-analysis", {
    body: { action, payload },
  });
  if (error) throw new Error(error.message);
  return data;
};

export function useAIAnalysis() {
  const analyzeConversation = (conversationId: string) =>
    invokeAI("analyze_conversation", { conversation_id: conversationId });

  const askAI = (question: string, instanceId?: string | null, targetTenantId?: string | null): Promise<{ answer: string }> =>
    invokeAI("ask_ai", { question, instance_id: instanceId ?? null, target_tenant_id: targetTenantId ?? undefined });

  const generateScript = (params: {
    lead_name: string;
    product_interest: string;
    hours_without_reply: number;
    last_message: string;
    objecao?: string;
  }): Promise<{ script: string }> =>
    invokeAI("generate_script", params);

  const getDashboard = (forceRefresh = false, instanceId?: string | null, targetTenantId?: string | null): Promise<{ data: AIDashboardData }> =>
    invokeAI("get_dashboard", { force_refresh: forceRefresh, instance_id: instanceId ?? null, target_tenant_id: targetTenantId ?? undefined });

  const getInsights = (instanceId?: string | null, targetTenantId?: string | null): Promise<{ insights: AIInsight[] }> =>
    invokeAI("get_insights", { instance_id: instanceId ?? null, target_tenant_id: targetTenantId ?? undefined });

  const getTemporalPatterns = (instanceId?: string | null, targetTenantId?: string | null): Promise<TemporalPattern> =>
    invokeAI("get_temporal_patterns", { instance_id: instanceId ?? null, target_tenant_id: targetTenantId ?? undefined });

  const getPipeline = (instanceId?: string | null, targetTenantId?: string | null): Promise<{ hot_leads: PipelineLead[]; warm_leads: PipelineLead[] }> =>
    invokeAI("get_pipeline", { instance_id: instanceId ?? null, target_tenant_id: targetTenantId ?? undefined });

  const listInstances = (targetTenantId?: string | null): Promise<{ instances: WhatsAppInstance[] }> =>
    invokeAI("list_instances", { target_tenant_id: targetTenantId ?? undefined });

  const getAnalysisStatus = (instanceId?: string | null, targetTenantId?: string | null): Promise<AnalysisStatus> =>
    invokeAI("get_analysis_status", { instance_id: instanceId ?? null, target_tenant_id: targetTenantId ?? undefined });

  const analyzeAllConversations = (instanceId?: string | null, targetTenantId?: string | null): Promise<{ analyzed: number; total_queued: number; errors: number; message: string }> =>
    invokeAI("analyze_all_conversations", { instance_id: instanceId ?? null, limit: 20, target_tenant_id: targetTenantId ?? undefined });

  const processQueue = (instanceId?: string | null, limit = 2, targetTenantId?: string | null): Promise<{ processed: number; remaining: number }> =>
    invokeAI("process_queue", { instance_id: instanceId ?? null, limit, target_tenant_id: targetTenantId ?? undefined });

  const listAccessibleTenants = (): Promise<{ tenants: AccessibleTenant[]; team_members: TeamMember[] }> =>
    invokeAI("list_accessible_tenants", {});

  const getConversationAnalysis = async (conversationId: string): Promise<AIConversationAnalysis | null> => {
    const { data, error } = await supabase
      .from("ai_conversation_analysis" as any)
      .select("*")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as AIConversationAnalysis | null;
  };

  return {
    analyzeConversation,
    askAI,
    generateScript,
    getDashboard,
    getInsights,
    getTemporalPatterns,
    getPipeline,
    listInstances,
    getAnalysisStatus,
    analyzeAllConversations,
    processQueue,
    getConversationAnalysis,
    listAccessibleTenants,
  };
}
