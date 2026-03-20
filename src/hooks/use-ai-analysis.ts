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

  const getConversationAnalysis = async (conversationId: string): Promise<AIConversationAnalysis | null> => {
    const { data, error } = await supabase
      .from("ai_conversation_analysis" as any)
      .select("*")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as AIConversationAnalysis | null;
  };

  return { analyzeConversation, askAI, generateScript, getDashboard, getConversationAnalysis };
}
