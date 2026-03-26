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

  const askAI = (question: string): Promise<{ answer: string }> =>
    invokeAI("ask_ai", { question });

  const generateScript = (params: {
    lead_name: string;
    product_interest: string;
    hours_without_reply: number;
    last_message: string;
    objecao?: string;
  }): Promise<{ script: string }> =>
    invokeAI("generate_script", params);

  const getDashboard = (forceRefresh = false): Promise<{ data: AIDashboardData }> =>
    invokeAI("get_dashboard", { force_refresh: forceRefresh });

  const getInsights = (): Promise<{ insights: AIInsight[] }> =>
    invokeAI("get_insights", {});

  const getTemporalPatterns = (): Promise<TemporalPattern> =>
    invokeAI("get_temporal_patterns", {});

  const getPipeline = (): Promise<{ hot_leads: PipelineLead[]; warm_leads: PipelineLead[] }> =>
    invokeAI("get_pipeline", {});

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
    getConversationAnalysis,
  };
}
