import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIAnalysisRun {
  id: string;
  tenant_id: string;
  status: "pending" | "processing" | "completed" | "failed" | "running" | "error";
  period_start: string | null;
  period_end: string | null;
  messages_analyzed: number;
  conversations_analyzed: number;
  summary: AnalysisSummary | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
}

export interface AnalysisSummary {
  score_overall: number | null;
  score_response_time: number | null;
  score_empathy: number | null;
  score_product_knowledge: number | null;
  score_objection_handling: number | null;
  score_closing_technique: number | null;
  score_follow_up: number | null;
  total_conversations: number;
  total_messages: number;
}

export interface ScoreDetails {
  observations: string[];
  message_refs: Array<{ message_id: string; excerpt: string }>;
}

export interface AIAnalysisConversation {
  id: string;
  run_id: string;
  tenant_id: string;
  conversation_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  messages_count: number;
  score_response_time: number | null;
  score_empathy: number | null;
  score_product_knowledge: number | null;
  score_objection_handling: number | null;
  score_closing_technique: number | null;
  score_follow_up: number | null;
  score_overall: number | null;
  details: {
    response_time?: ScoreDetails;
    empathy?: ScoreDetails;
    product_knowledge?: ScoreDetails;
    objection_handling?: ScoreDetails;
    closing_technique?: ScoreDetails;
    follow_up?: ScoreDetails;
  };
  improvement_points: Array<{
    category: string;
    title: string;
    description: string;
    severity: string;
  }>;
  positive_points: Array<{
    title: string;
    description: string;
  }>;
  created_at: string;
}

export interface AIAnalysisImprovement {
  id: string;
  run_id: string;
  tenant_id: string;
  category: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  occurrence_count: number;
  example_refs: Array<{
    conversation_id: string;
    message_id?: string;
    contact_name?: string;
    excerpt?: string;
  }>;
  created_at: string;
}

export interface AIAnalysisSchedule {
  id: string;
  tenant_id: string;
  enabled: boolean;
  frequency: "daily" | "weekly" | "biweekly" | "monthly";
  day_of_week: number;
  time_of_day: string;
  timezone: string;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AISystemSettings {
  provider: string;
  analysis_model: string;
  insights_model: string;
  avg_ticket_brl: number;
  schedule_enabled: boolean;
  schedule_hour: number;
  schedule_minute: number;
  schedule_days: number[];
  schedule_timezone: string;
  max_history_runs: number;
  allow_manual_triggers: boolean;
  max_triggers_per_period: number;
  trigger_period_days: number;
  last_run_at: string | null;
  next_run_at: string | null;
}

export type AIAnalysisSettings = AISystemSettings;

export interface LatestAnalysisResult {
  run: AIAnalysisRun | null;
  conversations: AIAnalysisConversation[];
  improvements: AIAnalysisImprovement[];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const invokeAI = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("ai-analysis", { body });
  if (error) throw error;
  return data;
};

export function useAIAnalysis() {
  const getLatestAnalysis = async (tenantId?: string): Promise<LatestAnalysisResult> => {
    const body: Record<string, unknown> = { action: "get_latest_analysis" };
    if (tenantId) body.tenant_id = tenantId;
    return await invokeAI(body);
  };

  const getAnalysisHistory = async (tenantId?: string, page = 0) => {
    const body: Record<string, unknown> = { action: "get_analysis_history", page };
    if (tenantId) body.tenant_id = tenantId;
    return await invokeAI(body) as { runs: AIAnalysisRun[] };
  };

  const getAnalysisById = async (runId: string, tenantId?: string): Promise<LatestAnalysisResult> => {
    const body: Record<string, unknown> = { action: "get_analysis_by_id", run_id: runId };
    if (tenantId) body.tenant_id = tenantId;
    return await invokeAI(body);
  };

  const getSchedule = async (tenantId?: string): Promise<{ schedule: AIAnalysisSchedule | null }> => {
    const body: Record<string, unknown> = { action: "get_schedule" };
    if (tenantId) body.tenant_id = tenantId;
    return await invokeAI(body);
  };

  const updateSchedule = async (params: {
    frequency: string;
    day_of_week: number;
    time_of_day: string;
    timezone: string;
    enabled: boolean;
    tenant_id?: string;
  }): Promise<{ schedule: AIAnalysisSchedule }> => {
    return await invokeAI({ action: "update_schedule", ...params });
  };

  const runAnalysis = async (tenantId?: string): Promise<{ run_id: string; status: string; summary?: AnalysisSummary }> => {
    const body: Record<string, unknown> = { action: "run_analysis" };
    if (tenantId) body.tenant_id = tenantId;
    return await invokeAI(body);
  };

  const chatConsultant = async (params: {
    message: string;
    conversation_history?: Array<{ role: string; content: string }>;
    context?: Record<string, unknown>;
    tenant_id?: string;
  }): Promise<{ reply: string }> => {
    return await invokeAI({ action: "chat_consultant", ...params });
  };

  const getSystemSettings = async (): Promise<AISystemSettings> => {
    const { data, error } = await supabase
      .from("ai_system_settings")
      .select("*")
      .limit(1)
      .single();
    if (error) throw error;
    return data as unknown as AISystemSettings;
  };

  const updateSystemSettings = async (settings: Partial<AISystemSettings> & { api_key?: string }): Promise<AISystemSettings> => {
    const { data, error } = await supabase
      .from("ai_system_settings")
      .update(settings as any)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as AISystemSettings;
  };

  const getAnalysisRuns = async (page = 0): Promise<AIAnalysisRun[]> => {
    const { data, error } = await supabase
      .from("ai_analysis_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(page * 20, (page + 1) * 20 - 1);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      status: r.status,
      period_start: null,
      period_end: null,
      messages_analyzed: 0,
      conversations_analyzed: r.conversations_analyzed ?? 0,
      summary: null,
      error_message: r.error_message,
      created_at: r.created_at,
      completed_at: r.completed_at,
      created_by: r.triggered_by_user_id,
      run_at: r.run_at,
      triggered_by: r.triggered_by,
      conversations_total: r.conversations_total ?? 0,
    }));
  };

  const deleteRun = async (runId: string): Promise<void> => {
    const { error } = await supabase
      .from("ai_analysis_runs")
      .delete()
      .eq("id", runId);
    if (error) throw error;
  };

  const analyzeConversation = async (conversationId: string, tenantId: string) => {
    return await invokeAI({ action: "analyze_conversation", conversation_id: conversationId, tenant_id: tenantId });
  };

  return {
    getLatestAnalysis,
    getAnalysisHistory,
    getAnalysisById,
    getSchedule,
    updateSchedule,
    runAnalysis,
    chatConsultant,
    getSystemSettings,
    updateSystemSettings,
    getAnalysisRuns,
    deleteRun,
    analyzeConversation,
  };
}
