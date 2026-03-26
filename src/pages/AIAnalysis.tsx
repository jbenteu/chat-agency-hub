import React, { useEffect, useState, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import ReactMarkdown from "react-markdown";
import {
  useAIAnalysis,
  type AIDashboardData,
  type AIInsight,
  type TemporalPattern,
  type PipelineLead,
  type WhatsAppInstance,
  type AnalysisStatus,
} from "@/hooks/use-ai-analysis";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie,
} from "recharts";
import {
  RefreshCw, Copy, Sparkles, Check,
  LayoutDashboard, AlertCircle, BarChart2, Star,
  MessageSquareWarning, MessageSquare, Flame,
  ArrowUpRight, MessageSquarePlus, Loader2, Tag, AlertTriangle,
  ChevronDown, Wand2, Send, User, Clock, TrendingUp,
  Zap, Target, ShieldAlert, TrendingDown, Gem, Users,
  ChevronRight, Eye, Wifi, WifiOff, PlayCircle, CheckCircle2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreColor = (v: number | null) => {
  if (v === null) return "text-zinc-400";
  if (v >= 7) return "text-emerald-600";
  if (v >= 5) return "text-amber-600";
  return "text-red-500";
};

const scoreBarColor = (v: number | null) => {
  if (v === null) return "#e4e4e7";
  if (v >= 7) return "#10b981";
  if (v >= 5) return "#f59e0b";
  return "#ef4444";
};

const formatHours = (h: number) => {
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 24) return `${Math.round(h)}h`;
  const d = Math.floor(h / 24);
  const rem = Math.round(h % 24);
  return rem > 0 ? `${d}d ${rem}h` : `${d}d`;
};

const getInitials = (name: string | null) => {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
};

const statusColors: Record<string, string> = {
  quente: "bg-emerald-50 border-emerald-200 text-emerald-700",
  morno: "bg-amber-50 border-amber-200 text-amber-700",
  frio: "bg-zinc-100 border-zinc-200 text-zinc-500",
  perdido: "bg-red-50 border-red-200 text-red-700",
};

const insightConfig: Record<AIInsight["tipo"], { icon: React.ElementType; color: string; border: string; bg: string; label: string }> = {
  urgente: { icon: Zap, color: "text-red-600", border: "border-red-200", bg: "bg-red-50", label: "Urgente" },
  oportunidade: { icon: Target, color: "text-emerald-600", border: "border-emerald-200", bg: "bg-emerald-50", label: "Oportunidade" },
  alerta: { icon: ShieldAlert, color: "text-amber-600", border: "border-amber-200", bg: "bg-amber-50", label: "Alerta" },
  tendencia: { icon: TrendingUp, color: "text-blue-600", border: "border-blue-200", bg: "bg-blue-50", label: "Tendência" },
};

const scoreLabels: Record<string, string> = {
  empatia: "Empatia",
  clareza: "Clareza",
  velocidade: "Velocidade",
  followup: "Follow-up",
  contorno_objecao: "Objeções",
  cta: "CTA",
  personalizacao: "Personalização",
};

const quickQuestions = [
  "Qual o melhor horário para abordar leads de joias?",
  "Quais objeções mais prejudicam as vendas?",
  "Como está a qualidade geral do atendimento?",
  "Quais produtos têm mais tração este mês?",
  "O que fazer para converter mais leads quentes?",
  "Análise completa do mês — pontos fortes e fracos",
];

const TABS = [
  { value: "painel", label: "Painel", icon: LayoutDashboard },
  { value: "insights", label: "Insights IA", icon: Sparkles },
  { value: "pipeline", label: "Pipeline", icon: Flame },
  { value: "padroes", label: "Padrões", icon: Clock },
  { value: "objecoes", label: "Produtos & Objeções", icon: MessageSquareWarning },
  { value: "scores", label: "Scores", icon: BarChart2 },
  { value: "consultor", label: "Consultor IA", icon: MessageSquare },
];

interface ScoresRow {
  id: string;
  conversation_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  sentimento: string | null;
  produto_interesse: string | null;
  score_qualidade: number | null;
  status_lead: string | null;
  analyzed_at: string;
  score_empatia: number | null;
  score_clareza: number | null;
  score_velocidade: number | null;
  score_followup: number | null;
  score_contorno_objecao: number | null;
  score_cta: number | null;
  score_personalizacao: number | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ─── Component ────────────────────────────────────────────────────────────────

const AIAnalysis: React.FC = () => {
  const { getDashboard, generateScript, askAI, getInsights, getTemporalPatterns, getPipeline, listInstances, getAnalysisStatus, analyzeAllConversations } = useAIAnalysis();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("painel");
  const [dashboardData, setDashboardData] = useState<AIDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Instance selector
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [instancesLoading, setInstancesLoading] = useState(true);

  // Analysis coverage monitor
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Insights
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsLoaded, setInsightsLoaded] = useState(false);

  // Pipeline
  const [hotLeads, setHotLeads] = useState<PipelineLead[]>([]);
  const [warmLeads, setWarmLeads] = useState<PipelineLead[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);

  // Padrões
  const [patterns, setPatterns] = useState<TemporalPattern | null>(null);
  const [patternsLoading, setPatternsLoading] = useState(false);

  // Scores
  const [scoresData, setScoresData] = useState<ScoresRow[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Scripts
  const [generatingScript, setGeneratingScript] = useState<Record<string, boolean>>({});
  const [generatedScripts, setGeneratedScripts] = useState<Record<string, string>>({});
  const [selectedScript, setSelectedScript] = useState<string | null>(null);
  const [objectionScripts, setObjectionScripts] = useState<string[]>([]);
  const [objectionLoading, setObjectionLoading] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadInstances = async () => {
    try {
      setInstancesLoading(true);
      const result = await listInstances();
      setInstances(result.instances || []);
    } catch { /* silent */ } finally {
      setInstancesLoading(false);
    }
  };

  const loadAnalysisStatus = async (instId: string | null) => {
    try {
      const result = await getAnalysisStatus(instId);
      setAnalysisStatus(result);
    } catch { /* silent */ }
  };

  const handleAnalyzeAll = async () => {
    try {
      setAnalyzing(true);
      const result = await analyzeAllConversations(selectedInstanceId);
      toast({ title: "Análise concluída", description: result.message });
      await loadAnalysisStatus(selectedInstanceId);
      await loadDashboard(true);
    } catch (err) {
      toast({ title: "Erro na análise", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const loadDashboard = async (force = false) => {
    try {
      setLoading(true);
      const result = await getDashboard(force, selectedInstanceId);
      setDashboardData(result.data);
    } catch (err) {
      toast({ title: "Erro ao carregar dados", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadInsights = async () => {
    try {
      setInsightsLoading(true);
      setInsights([]);
      const result = await getInsights(selectedInstanceId);
      setInsights(result.insights || []);
      setInsightsLoaded(true);
    } catch (err) {
      toast({ title: "Erro ao gerar insights", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setInsightsLoading(false);
    }
  };

  const loadPipeline = async () => {
    try {
      setPipelineLoading(true);
      const result = await getPipeline(selectedInstanceId);
      setHotLeads(result.hot_leads || []);
      setWarmLeads(result.warm_leads || []);
    } catch {
      // silent
    } finally {
      setPipelineLoading(false);
    }
  };

  const loadPatterns = async () => {
    try {
      setPatternsLoading(true);
      const result = await getTemporalPatterns(selectedInstanceId);
      setPatterns(result);
    } catch {
      // silent
    } finally {
      setPatternsLoading(false);
    }
  };

  const loadScores = async () => {
    try {
      setScoresLoading(true);
      const { data: userRoles } = await supabase.from("user_roles").select("tenant_id").limit(1).single();
      if (!userRoles) return;
      const { data } = await supabase
        .from("ai_conversation_analysis" as any)
        .select("*")
        .eq("tenant_id", userRoles.tenant_id)
        .order("analyzed_at", { ascending: false })
        .limit(50);
      if (!data || data.length === 0) { setScoresData([]); return; }
      const convIds = data.map((d: any) => d.conversation_id);
      const { data: convs } = await supabase
        .from("whatsapp_conversations")
        .select("id, contact_name, contact_phone")
        .in("id", convIds);
      const convMap: Record<string, { contact_name: string | null; contact_phone: string | null }> = {};
      (convs || []).forEach((c: any) => { convMap[c.id] = c; });
      setScoresData(data.map((d: any) => ({
        ...d,
        contact_name: convMap[d.conversation_id]?.contact_name || null,
        contact_phone: convMap[d.conversation_id]?.contact_phone || null,
      })));
    } catch { /* silent */ } finally {
      setScoresLoading(false);
    }
  };

  useEffect(() => {
    loadInstances();
    loadDashboard();
    loadAnalysisStatus(null);
  }, []);

  // Reload everything when instance changes
  useEffect(() => {
    setDashboardData(null);
    setInsights([]);
    setInsightsLoaded(false);
    setHotLeads([]);
    setWarmLeads([]);
    setPatterns(null);
    setScoresData([]);
    loadDashboard();
    loadAnalysisStatus(selectedInstanceId);
  }, [selectedInstanceId]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === "insights" && !insightsLoaded && !insightsLoading) loadInsights();
    if (value === "pipeline" && hotLeads.length === 0 && warmLeads.length === 0) loadPipeline();
    if (value === "padroes" && !patterns) loadPatterns();
    if (value === "scores" && scoresData.length === 0) loadScores();
  };

  // ── Chat ───────────────────────────────────────────────────────────────────

  const scrollToBottom = () => setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

  const handleAsk = async () => {
    if (!askQuestion.trim()) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: askQuestion.trim(), timestamp: new Date() };
    setChatMessages((prev) => [...prev, userMsg]);
    setAskQuestion("");
    scrollToBottom();
    try {
      setAskLoading(true);
      const result = await askAI(userMsg.content, selectedInstanceId);
      setChatMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: result.answer, timestamp: new Date() }]);
      scrollToBottom();
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro ao consultar IA", variant: "destructive" });
    } finally {
      setAskLoading(false);
    }
  };

  // ── Scripts ─────────────────────────────────────────────────────────────────

  const handleGenerateScript = async (
    leadId: string, leadName: string, productInterest: string,
    hoursWithoutReply: number, lastMessage: string, objecao?: string,
  ) => {
    try {
      setGeneratingScript((p) => ({ ...p, [leadId]: true }));
      const result = await generateScript({ lead_name: leadName, product_interest: productInterest, hours_without_reply: hoursWithoutReply, last_message: lastMessage, objecao });
      setGeneratedScripts((p) => ({ ...p, [leadId]: result.script }));
      setSelectedScript(result.script);
    } catch {
      toast({ title: "Erro", description: "Falha ao gerar script", variant: "destructive" });
    } finally {
      setGeneratingScript((p) => ({ ...p, [leadId]: false }));
    }
  };

  const handleObjectionScripts = async () => {
    if (!dashboardData?.top_objecoes?.length) return;
    try {
      setObjectionLoading(true);
      const top3 = dashboardData.top_objecoes.slice(0, 3);
      const results = await Promise.all(
        top3.map((o) => generateScript({ lead_name: "Cliente", product_interest: "joias", hours_without_reply: 24, last_message: "", objecao: o.objecao_detectada })),
      );
      setObjectionScripts(results.map((r) => r.script));
    } catch {
      toast({ title: "Erro", description: "Falha ao gerar scripts", variant: "destructive" });
    } finally {
      setObjectionLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copiado!", description: "Texto copiado para a área de transferência" });
  };

  // ── Derived values ──────────────────────────────────────────────────────────

  const leadsCount = dashboardData?.leads_sem_resposta ?? 0;
  const isEmpty = !dashboardData || (dashboardData.total_conversas_mes === 0 && dashboardData.leads_sem_resposta_lista.length === 0);

  const radarData = dashboardData?.media_scores
    ? Object.entries(scoreLabels).map(([key, label]) => ({
        label,
        score: dashboardData.media_scores[key as keyof typeof dashboardData.media_scores] ?? 0,
        fullMark: 10,
      }))
    : [];

  const funnelData = dashboardData?.leads_por_status
    ? [
        { name: "Quente", value: dashboardData.leads_por_status.quente ?? 0, color: "#10b981" },
        { name: "Morno", value: dashboardData.leads_por_status.morno ?? 0, color: "#f59e0b" },
        { name: "Frio", value: dashboardData.leads_por_status.frio ?? 0, color: "#a1a1aa" },
        { name: "Perdido", value: dashboardData.leads_por_status.perdido ?? 0, color: "#ef4444" },
      ].filter((d) => d.value > 0)
    : [];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex justify-between items-start pb-5 border-b border-zinc-200">
          <div>
            <div className="flex items-center gap-2">
              <Gem className="text-violet-500" size={20} />
              <h1 className="text-2xl font-semibold text-foreground">Inteligência de Vendas</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Análise IA para joalheria — dados dos últimos 30 dias</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadDashboard(true)}
            disabled={loading}
            className="border-zinc-200 text-muted-foreground hover:border-violet-400 transition-all"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Instance Selector */}
        {!instancesLoading && instances.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">Instância:</span>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedInstanceId(null)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border ${
                    selectedInstanceId === null
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-white text-muted-foreground border-zinc-200 hover:border-violet-300 hover:text-violet-600"
                  }`}
                >
                  <Users size={13} />
                  Todas ({instances.length})
                </button>
                {instances.map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => setSelectedInstanceId(inst.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border ${
                      selectedInstanceId === inst.id
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white text-muted-foreground border-zinc-200 hover:border-violet-300 hover:text-violet-600"
                    }`}
                  >
                    {inst.status === "connected" ? (
                      <Wifi size={12} className={selectedInstanceId === inst.id ? "text-white" : "text-emerald-500"} />
                    ) : (
                      <WifiOff size={12} className={selectedInstanceId === inst.id ? "text-white/70" : "text-zinc-400"} />
                    )}
                    {inst.display_name || inst.instance_name}
                  </button>
                ))}
              </div>
            </div>

            {/* Analysis coverage bar */}
            {analysisStatus && (
              <div className="flex items-center gap-2.5 bg-muted/40 border border-border rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`size-2 rounded-full shrink-0 ${
                    analysisStatus.coverage_pct >= 80 ? "bg-emerald-500" :
                    analysisStatus.coverage_pct >= 40 ? "bg-amber-500" : "bg-red-500"
                  }`} />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    <span className="font-medium text-foreground">{analysisStatus.analyzed_conversations}/{analysisStatus.total_conversations}</span> analisadas
                    <span className="ml-1 font-medium" style={{ color: analysisStatus.coverage_pct >= 80 ? 'var(--success, #10b981)' : analysisStatus.coverage_pct >= 40 ? '#d97706' : '#ef4444' }}>
                      ({analysisStatus.coverage_pct}%)
                    </span>
                  </span>
                </div>
                <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden shrink-0">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      analysisStatus.coverage_pct >= 80 ? "bg-emerald-500" :
                      analysisStatus.coverage_pct >= 40 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${analysisStatus.coverage_pct}%` }}
                  />
                </div>
                {analysisStatus.coverage_pct < 100 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAnalyzeAll}
                    disabled={analyzing}
                    className="shrink-0 text-primary hover:text-primary/80 h-6 px-2 text-[11px] font-medium"
                  >
                    {analyzing ? (
                      <><Loader2 size={12} className="animate-spin mr-1" />Analisando...</>
                    ) : (
                      <><PlayCircle size={12} className="mr-1" />Analisar</>
                    )}
                  </Button>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium shrink-0">
                    <CheckCircle2 size={12} />
                    Completo
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {isEmpty && !loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Sparkles className="text-violet-400" size={40} />
            <p className="text-foreground font-medium">Nenhuma conversa analisada ainda</p>
            <p className="text-muted-foreground text-sm">As análises são geradas automaticamente conforme mensagens chegam.</p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="bg-zinc-100 rounded-xl p-1 flex gap-1 flex-wrap">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => handleTabChange(tab.value)}
                    className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm transition-all cursor-pointer ${
                      isActive
                        ? "bg-white text-foreground font-medium border border-zinc-200 shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/60 border border-transparent"
                    }`}
                  >
                    <Icon size={13} />
                    {tab.label}
                    {tab.value === "pipeline" && (hotLeads.length > 0) && (
                      <span className="bg-emerald-100 text-emerald-700 text-xs rounded-full px-1.5 min-w-[18px] text-center font-medium">
                        {hotLeads.length}
                      </span>
                    )}
                    {tab.value === "painel" && leadsCount > 0 && (
                      <span className="bg-red-100 text-red-600 text-xs rounded-full px-1.5 min-w-[18px] text-center font-medium">
                        {leadsCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB: PAINEL                                                  */}
            {/* ════════════════════════════════════════════════════════════ */}
            {activeTab === "painel" && (
              <div className="space-y-5">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="bg-white rounded-xl border border-zinc-200 p-5 animate-pulse">
                        <div className="h-3 w-24 bg-zinc-100 rounded mb-4" />
                        <div className="h-8 w-16 bg-zinc-100 rounded" />
                      </div>
                    ))
                  ) : (
                    <>
                      <div className={`bg-white rounded-xl border border-zinc-200 p-5 border-l-4 ${
                        dashboardData?.score_medio == null ? "border-l-zinc-300" :
                        dashboardData.score_medio >= 7 ? "border-l-emerald-500" :
                        dashboardData.score_medio >= 5 ? "border-l-amber-500" : "border-l-red-500"
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Score de Qualidade</span>
                          <Star size={14} className="text-zinc-300" />
                        </div>
                        <p className={`text-3xl font-bold ${scoreColor(dashboardData?.score_medio ?? null)}`}>
                          {dashboardData?.score_medio ? `${dashboardData.score_medio.toFixed(1)}` : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">média geral / 10</p>
                      </div>

                      <div className={`bg-white rounded-xl border border-zinc-200 p-5 border-l-4 ${
                        leadsCount >= 10 ? "border-l-red-500" : leadsCount >= 5 ? "border-l-amber-500" : "border-l-emerald-500"
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Sem Resposta</span>
                          <AlertCircle size={14} className="text-zinc-300" />
                        </div>
                        <p className={`text-3xl font-bold ${leadsCount >= 10 ? "text-red-600" : leadsCount >= 5 ? "text-amber-600" : "text-emerald-600"}`}>
                          {leadsCount}
                        </p>
                        {leadsCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 rounded-full px-2 py-0.5 border border-red-200 mt-1">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                            requer atenção
                          </span>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1">todos respondidos</p>
                        )}
                      </div>

                      <div className="bg-white rounded-xl border border-zinc-200 p-5 border-l-4 border-l-blue-500">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Conversas</span>
                          <MessageSquare size={14} className="text-zinc-300" />
                        </div>
                        <p className="text-3xl font-bold text-blue-600">{dashboardData?.total_conversas_mes ?? 0}</p>
                        <p className="text-xs text-muted-foreground mt-1">nos últimos 30 dias</p>
                      </div>

                      <div className="bg-white rounded-xl border border-zinc-200 p-5 border-l-4 border-l-emerald-500">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Leads Quentes</span>
                          <Flame size={14} className="text-zinc-300" />
                        </div>
                        <p className={`text-3xl font-bold ${(dashboardData?.leads_por_status?.quente ?? 0) > 0 ? "text-emerald-600" : "text-zinc-400"}`}>
                          {dashboardData?.leads_por_status?.quente ?? 0}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">prontos para fechar</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Charts row */}
                {!loading && dashboardData && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Radar de Performance */}
                    <div className="bg-white rounded-xl border border-zinc-200 p-5">
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-foreground">Radar de Performance</h3>
                        <p className="text-xs text-muted-foreground">Score médio por dimensão do atendimento</p>
                      </div>
                      {radarData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={90}>
                            <PolarGrid stroke="#f4f4f5" />
                            <PolarAngleAxis
                              dataKey="label"
                              tick={{ fontSize: 11, fill: "#71717a" }}
                            />
                            <Radar
                              name="Score"
                              dataKey="score"
                              stroke="#7c3aed"
                              fill="#7c3aed"
                              fillOpacity={0.15}
                              strokeWidth={2}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                          Sem dados suficientes
                        </div>
                      )}
                    </div>

                    {/* Distribuição de Leads */}
                    <div className="bg-white rounded-xl border border-zinc-200 p-5">
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-foreground">Distribuição do Pipeline</h3>
                        <p className="text-xs text-muted-foreground">Status dos leads analisados</p>
                      </div>
                      {funnelData.length > 0 ? (
                        <>
                          <ResponsiveContainer width="100%" height={170}>
                            <PieChart>
                              <Pie
                                data={funnelData}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {funnelData.map((entry, index) => (
                                  <Cell key={index} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(v) => [v, ""]} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            {funnelData.map((d) => (
                              <div key={d.name} className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                                <span className="text-xs text-muted-foreground">{d.name}</span>
                                <span className="text-xs font-semibold text-foreground ml-auto">{d.value}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                          Sem dados de leads
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Score bars */}
                {!loading && dashboardData?.media_scores && (
                  <div className="bg-white rounded-xl border border-zinc-200 p-5">
                    <div className="mb-4 flex justify-between items-start">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Scores Médios por Critério</h3>
                        <p className="text-xs text-muted-foreground">Baseado nas conversas analisadas pela IA</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                      {Object.entries(scoreLabels).map(([key, label]) => {
                        const val = dashboardData.media_scores[key as keyof typeof dashboardData.media_scores];
                        const pct = val ? (val / 10) * 100 : 0;
                        return (
                          <div key={key} className="flex items-center gap-3 py-2 border-b border-zinc-50 last:border-0">
                            <span className="text-sm text-muted-foreground w-36 shrink-0">{label}</span>
                            <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${pct}%`, backgroundColor: scoreBarColor(val) }}
                              />
                            </div>
                            <span className={`text-sm font-semibold w-10 text-right ${scoreColor(val)}`}>
                              {val?.toFixed(1) ?? "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Leads sem resposta — mini lista */}
                {!loading && (dashboardData?.leads_sem_resposta_lista?.length ?? 0) > 0 && (
                  <div className="bg-white rounded-xl border border-zinc-200 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <AlertCircle size={16} className="text-red-500" />
                        <h3 className="text-sm font-semibold text-foreground">Leads Aguardando Resposta</h3>
                      </div>
                      <span className="text-xs bg-red-50 border border-red-200 text-red-600 rounded-full px-2.5 py-0.5">
                        {dashboardData!.leads_sem_resposta_lista.length} pendentes
                      </span>
                    </div>
                    <div className="space-y-2">
                      {dashboardData!.leads_sem_resposta_lista.slice(0, 5).map((lead) => (
                        <div key={lead.id} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg hover:bg-red-50 transition-colors group">
                          <div className="w-8 h-8 bg-zinc-200 rounded-full flex items-center justify-center text-xs font-semibold text-zinc-600 shrink-0">
                            {getInitials(lead.contact_name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{lead.contact_name || lead.contact_phone || "Desconhecido"}</p>
                            <p className={`text-xs ${lead.horas_sem_resposta > 24 ? "text-red-500" : "text-muted-foreground"}`}>
                              Sem resposta há {formatHours(lead.horas_sem_resposta)}
                              {lead.produto_interesse && ` · ${lead.produto_interesse}`}
                            </p>
                          </div>
                          <button
                            onClick={() => navigate("/whatsapp")}
                            className="text-xs text-muted-foreground hover:text-violet-600 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            Ver <ArrowUpRight size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB: INSIGHTS IA                                             */}
            {/* ════════════════════════════════════════════════════════════ */}
            {activeTab === "insights" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Insights Estratégicos</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Gerados em tempo real pela IA com base nos dados do seu negócio</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadInsights}
                    disabled={insightsLoading}
                    className="border-violet-200 text-violet-600 hover:bg-violet-50"
                  >
                    {insightsLoading ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Sparkles size={14} className="mr-1.5" />}
                    {insightsLoaded ? "Regenerar" : "Gerar insights"}
                  </Button>
                </div>

                {insightsLoading && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="bg-white rounded-xl border border-zinc-200 p-5 animate-pulse">
                        <div className="h-4 w-20 bg-zinc-100 rounded mb-3" />
                        <div className="h-5 w-3/4 bg-zinc-100 rounded mb-2" />
                        <div className="h-3 w-full bg-zinc-100 rounded mb-1" />
                        <div className="h-3 w-5/6 bg-zinc-100 rounded mb-3" />
                        <div className="h-3 w-2/3 bg-zinc-100 rounded" />
                      </div>
                    ))}
                  </div>
                )}

                {!insightsLoading && insights.length === 0 && !insightsLoaded && (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center">
                      <Sparkles size={28} className="text-violet-500" />
                    </div>
                    <div className="text-center">
                      <p className="text-foreground font-medium">Gere insights personalizados</p>
                      <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                        A IA vai analisar seus dados e gerar recomendações específicas para sua joalheria — oportunidades, riscos e ações concretas.
                      </p>
                    </div>
                    <Button onClick={loadInsights} className="bg-violet-600 hover:bg-violet-500 text-white">
                      <Sparkles size={16} className="mr-2" />
                      Gerar insights agora
                    </Button>
                  </div>
                )}

                {!insightsLoading && insights.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {insights.map((insight, i) => {
                      const cfg = insightConfig[insight.tipo] || insightConfig.alerta;
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={i}
                          className={`bg-white rounded-xl border p-5 hover:shadow-sm transition-all ${cfg.border}`}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                              <Icon size={11} />
                              {cfg.label}
                            </span>
                          </div>
                          <h3 className="text-sm font-semibold text-foreground leading-snug mb-2">{insight.titulo}</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed mb-3">{insight.descricao}</p>
                          <div className={`flex items-start gap-2 p-3 rounded-lg ${cfg.bg} border ${cfg.border}`}>
                            <ChevronRight size={14} className={`${cfg.color} mt-0.5 shrink-0`} />
                            <p className={`text-xs font-medium ${cfg.color}`}>{insight.acao}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB: PIPELINE                                                */}
            {/* ════════════════════════════════════════════════════════════ */}
            {activeTab === "pipeline" && (
              <div className="space-y-6">
                {pipelineLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="bg-white rounded-xl border border-zinc-200 p-5 animate-pulse">
                        <div className="h-4 w-40 bg-zinc-100 rounded mb-2" />
                        <div className="h-3 w-64 bg-zinc-100 rounded" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Hot Leads */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Flame size={16} className="text-emerald-600" />
                        <h2 className="text-sm font-semibold text-foreground">Leads Quentes — Agir Agora</h2>
                        <span className="bg-emerald-100 text-emerald-700 text-xs rounded-full px-2 py-0.5 font-medium">
                          {hotLeads.length}
                        </span>
                      </div>

                      {hotLeads.length === 0 ? (
                        <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-8 text-center">
                          <p className="text-muted-foreground text-sm">Nenhum lead quente no momento</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {hotLeads.map((lead) => (
                            <LeadCard
                              key={lead.conversation_id}
                              lead={lead}
                              onNavigate={() => navigate("/whatsapp")}
                              onGenerateScript={handleGenerateScript}
                              generatingScript={generatingScript}
                              variant="hot"
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Warm Leads */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingDown size={16} className="text-amber-600" />
                        <h2 className="text-sm font-semibold text-foreground">Leads Mornos — Risco de Esfriamento</h2>
                        <span className="bg-amber-100 text-amber-700 text-xs rounded-full px-2 py-0.5 font-medium">
                          {warmLeads.length}
                        </span>
                      </div>

                      {warmLeads.length === 0 ? (
                        <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-8 text-center">
                          <p className="text-muted-foreground text-sm">Nenhum lead morno no momento</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {warmLeads.map((lead) => (
                            <LeadCard
                              key={lead.conversation_id}
                              lead={lead}
                              onNavigate={() => navigate("/whatsapp")}
                              onGenerateScript={handleGenerateScript}
                              generatingScript={generatingScript}
                              variant="warm"
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {hotLeads.length === 0 && warmLeads.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Users className="text-zinc-400" size={40} />
                        <p className="text-foreground font-medium">Pipeline vazio</p>
                        <p className="text-muted-foreground text-sm">Leads quentes e mornos aparecerão aqui após análise das conversas</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB: PADRÕES                                                 */}
            {/* ════════════════════════════════════════════════════════════ */}
            {activeTab === "padroes" && (
              <div className="space-y-5">
                {patternsLoading ? (
                  <div className="bg-white rounded-xl border border-zinc-200 p-6 animate-pulse">
                    <div className="h-6 w-48 bg-zinc-100 rounded mb-6" />
                    <div className="h-48 bg-zinc-100 rounded" />
                  </div>
                ) : !patterns ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Clock className="text-zinc-400" size={40} />
                    <p className="text-muted-foreground text-sm">Carregando padrões...</p>
                  </div>
                ) : (
                  <>
                    {/* Peak hour callouts */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Pico de mensagens recebidas</p>
                        <p className="text-2xl font-bold text-blue-700">
                          {String(patterns.peak_inbound_hour).padStart(2, "0")}:00h
                        </p>
                        <p className="text-xs text-blue-600 mt-1">horário com mais clientes ativos</p>
                      </div>
                      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                        <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1">Pico de envios pela equipe</p>
                        <p className="text-2xl font-bold text-violet-700">
                          {String(patterns.peak_outbound_hour).padStart(2, "0")}:00h
                        </p>
                        <p className="text-xs text-violet-600 mt-1">horário com mais respostas enviadas</p>
                      </div>
                    </div>

                    {/* Hora do dia */}
                    <div className="bg-white rounded-xl border border-zinc-200 p-5">
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-foreground">Volume por Hora do Dia</h3>
                        <p className="text-xs text-muted-foreground">Mensagens recebidas (azul) e enviadas (violeta) — horário de Brasília</p>
                      </div>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={patterns.hours} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: "#a1a1aa" }}
                            interval={2}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{ fontSize: 12, border: "1px solid #e4e4e7", borderRadius: 8, boxShadow: "none" }}
                            formatter={(v: number, name: string) => [v, name === "inbound" ? "Recebidas" : "Enviadas"]}
                          />
                          <Bar dataKey="inbound" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={16} />
                          <Bar dataKey="outbound" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={16} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Dia da semana */}
                    <div className="bg-white rounded-xl border border-zinc-200 p-5">
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-foreground">Volume por Dia da Semana</h3>
                        <p className="text-xs text-muted-foreground">Engajamento total de clientes por dia</p>
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={patterns.days} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #e4e4e7", borderRadius: 8, boxShadow: "none" }} />
                          <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={40}>
                            {patterns.days.map((entry, index) => (
                              <Cell
                                key={index}
                                fill={entry.total === Math.max(...patterns.days.map((d) => d.total)) ? "#7c3aed" : "#e4e4e7"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="mt-3 pt-3 border-t border-zinc-100">
                        <p className="text-xs text-muted-foreground">
                          Total: <span className="font-semibold text-foreground">{patterns.total_messages.toLocaleString("pt-BR")}</span> mensagens analisadas nos últimos 30 dias
                        </p>
                      </div>
                    </div>

                    {/* Heatmap de horas úteis */}
                    <div className="bg-white rounded-xl border border-zinc-200 p-5">
                      <div className="mb-4">
                        <h3 className="text-sm font-semibold text-foreground">Mapa de Calor — Horas Comerciais</h3>
                        <p className="text-xs text-muted-foreground">Intensidade de mensagens recebidas (7h–22h)</p>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {patterns.hours.filter((h) => h.hour >= 7 && h.hour <= 22).map((h) => {
                          const maxInbound = Math.max(...patterns.hours.map((x) => x.inbound), 1);
                          const intensity = h.inbound / maxInbound;
                          const opacity = Math.max(0.08, intensity);
                          return (
                            <div
                              key={h.hour}
                              className="flex flex-col items-center gap-1"
                              title={`${h.label}: ${h.inbound} mensagens recebidas`}
                            >
                              <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-medium transition-all"
                                style={{ backgroundColor: `rgba(124,58,237,${opacity})`, color: intensity > 0.5 ? "#fff" : "#6d28d9" }}
                              >
                                {h.inbound > 0 ? h.inbound : ""}
                              </div>
                              <span className="text-xs text-muted-foreground">{h.label.replace(":00", "h")}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB: PRODUTOS & OBJEÇÕES                                     */}
            {/* ════════════════════════════════════════════════════════════ */}
            {activeTab === "objecoes" && (
              <div className="space-y-5">
                {loading ? (
                  <div className="bg-white rounded-xl border border-zinc-200 p-6 animate-pulse">
                    <div className="h-48 bg-zinc-100 rounded" />
                  </div>
                ) : (
                  <>
                    <div className="grid md:grid-cols-2 gap-5">
                      {/* Produtos */}
                      <div className="bg-white rounded-xl border border-zinc-200 p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">Produtos com Mais Interesse</h3>
                            <p className="text-xs text-muted-foreground">Mencionados nas conversas analisadas</p>
                          </div>
                          <Gem size={16} className="text-zinc-300" />
                        </div>
                        {dashboardData?.top_produtos?.length ? (
                          <>
                            <ResponsiveContainer width="100%" height={160}>
                              <BarChart
                                data={dashboardData.top_produtos.slice(0, 6).map((p) => ({ name: p.produto_interesse, value: p.count }))}
                                layout="vertical"
                                margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                              >
                                <XAxis type="number" tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#52525b" }} axisLine={false} tickLine={false} width={100} />
                                <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #e4e4e7", borderRadius: 8, boxShadow: "none" }} />
                                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={16} />
                              </BarChart>
                            </ResponsiveContainer>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground py-8 text-center">Sem dados de produtos</p>
                        )}
                      </div>

                      {/* Objeções */}
                      <div className="bg-white rounded-xl border border-zinc-200 p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">Objeções mais Frequentes</h3>
                            <p className="text-xs text-muted-foreground">Barreiras identificadas pela IA</p>
                          </div>
                          <AlertTriangle size={16} className="text-zinc-300" />
                        </div>
                        {dashboardData?.top_objecoes?.length ? (
                          <div className="space-y-2.5">
                            {(() => {
                              const maxCount = dashboardData.top_objecoes[0]?.count || 1;
                              return dashboardData.top_objecoes.map((o, i) => (
                                <div key={i} className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm text-foreground">{o.objecao_detectada}</span>
                                    <span className="text-xs font-semibold text-red-600">{o.count}x</span>
                                  </div>
                                  <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-red-400 rounded-full"
                                      style={{ width: `${(o.count / maxCount) * 100}%` }}
                                    />
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground py-8 text-center">Sem objeções registradas</p>
                        )}
                      </div>
                    </div>

                    {/* Playbook de contorno */}
                    {dashboardData?.top_objecoes && dashboardData.top_objecoes.length > 0 && (
                      <div className="bg-white rounded-xl border border-zinc-200 p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-sm font-semibold text-foreground">Playbook de Contorno de Objeções</h3>
                            <p className="text-xs text-muted-foreground">Scripts gerados pela IA para as principais objeções</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleObjectionScripts}
                            disabled={objectionLoading}
                            className="border-violet-200 text-violet-600 hover:bg-violet-50 text-xs"
                          >
                            {objectionLoading ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Wand2 size={12} className="mr-1.5" />}
                            Gerar scripts
                          </Button>
                        </div>

                        {objectionScripts.length > 0 && (
                          <div className="grid md:grid-cols-3 gap-4">
                            {objectionScripts.map((script, i) => (
                              <div key={i} className="border border-zinc-200 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="w-5 h-5 bg-red-100 text-red-600 rounded-full text-xs font-bold flex items-center justify-center">
                                    {i + 1}
                                  </span>
                                  <p className="text-xs font-semibold text-foreground line-clamp-1">
                                    {dashboardData.top_objecoes[i]?.objecao_detectada}
                                  </p>
                                </div>
                                <div className="text-xs text-muted-foreground bg-zinc-50 rounded-lg p-3 leading-relaxed whitespace-pre-wrap border border-zinc-100">
                                  {script}
                                </div>
                                <button
                                  onClick={() => handleCopy(script)}
                                  className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-violet-600 transition-colors"
                                >
                                  <Copy size={11} />
                                  Copiar script
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {objectionScripts.length === 0 && !objectionLoading && (
                          <div className="bg-zinc-50 rounded-xl p-8 text-center border border-zinc-200 border-dashed">
                            <p className="text-sm text-muted-foreground">Clique em "Gerar scripts" para criar mensagens prontas para cada objeção</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB: SCORES                                                  */}
            {/* ════════════════════════════════════════════════════════════ */}
            {activeTab === "scores" && (
              <div className="space-y-3">
                {scoresLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="bg-white rounded-xl border border-zinc-200 p-4 animate-pulse">
                      <div className="h-5 w-40 bg-zinc-100 rounded mb-2" />
                      <div className="h-3 w-64 bg-zinc-100 rounded" />
                    </div>
                  ))
                ) : scoresData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <BarChart2 className="text-zinc-400" size={40} />
                    <p className="text-foreground font-medium">Nenhuma análise disponível</p>
                    <p className="text-muted-foreground text-sm">Os scores aparecem aqui após a análise das conversas</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">{scoresData.length} conversas analisadas — clique em uma linha para ver detalhes</p>
                    {scoresData.map((row) => (
                      <div key={row.id}>
                        <div
                          className="bg-white rounded-xl border border-zinc-200 px-4 py-3 hover:border-zinc-300 cursor-pointer transition-all flex items-center gap-3"
                          onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
                        >
                          <div className="w-8 h-8 bg-zinc-100 border border-zinc-200 rounded-full flex items-center justify-center text-xs font-semibold text-zinc-600 shrink-0">
                            {getInitials(row.contact_name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{row.contact_name || "—"}</p>
                            <p className="text-xs text-muted-foreground truncate">{row.contact_phone || ""}</p>
                          </div>
                          {row.sentimento && (
                            <span className={`text-xs rounded-full px-2 py-0.5 border font-medium shrink-0 ${
                              row.sentimento === "positivo" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                              row.sentimento === "frustrado" ? "bg-red-50 border-red-200 text-red-700" :
                              "bg-zinc-100 border-zinc-200 text-zinc-500"
                            }`}>
                              {row.sentimento}
                            </span>
                          )}
                          {row.status_lead && (
                            <span className={`text-xs rounded-full px-2 py-0.5 border font-medium shrink-0 ${statusColors[row.status_lead] || ""}`}>
                              {row.status_lead}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground hidden md:block shrink-0 max-w-28 truncate">{row.produto_interesse || "—"}</span>
                          <span className={`text-xl font-bold shrink-0 ${scoreColor(row.score_qualidade)}`}>
                            {row.score_qualidade ?? "—"}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                            {new Date(row.analyzed_at).toLocaleDateString("pt-BR")}
                          </span>
                          <ChevronDown size={15} className={`text-zinc-400 shrink-0 transition-transform duration-200 ${expandedRow === row.id ? "rotate-180" : ""}`} />
                        </div>
                        {expandedRow === row.id && (
                          <div className="bg-zinc-50 border border-zinc-200 border-t-0 rounded-b-xl p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {Object.entries(scoreLabels).map(([key, label]) => {
                                const val = row[`score_${key}` as keyof typeof row] as number | null;
                                return (
                                  <div key={key} className="bg-white rounded-lg p-3 text-center border border-zinc-200">
                                    <p className={`text-xl font-bold ${scoreColor(val)}`}>{val ?? "—"}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{label}</p>
                                    <div className="mt-2 h-1 bg-zinc-100 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: val ? `${(val / 10) * 100}%` : "0%", backgroundColor: scoreBarColor(val) }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="mt-3 flex items-center gap-3">
                              <button
                                onClick={() => navigate("/whatsapp")}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-white transition-all border border-transparent hover:border-zinc-200"
                              >
                                <Eye size={13} />
                                Ver conversa
                              </button>
                              <button
                                onClick={() => handleGenerateScript(row.id, row.contact_name || "Cliente", row.produto_interesse || "produto", 0, "")}
                                disabled={generatingScript[row.id]}
                                className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-700 px-3 py-1.5 rounded-lg hover:bg-violet-50 transition-all border border-transparent hover:border-violet-200"
                              >
                                {generatingScript[row.id] ? <Loader2 size={13} className="animate-spin" /> : <MessageSquarePlus size={13} />}
                                Gerar script de reengajamento
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TAB: CONSULTOR IA                                            */}
            {/* ════════════════════════════════════════════════════════════ */}
            {activeTab === "consultor" && (
              <div className="max-w-3xl mx-auto flex flex-col" style={{ height: "calc(100vh - 260px)" }}>
                <div className="flex-1 overflow-y-auto space-y-4 pb-4">
                  {chatMessages.length === 0 && !askLoading && (
                    <div className="flex flex-col items-center justify-center py-14 gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-center">
                        <Sparkles size={26} className="text-violet-500" />
                      </div>
                      <div className="text-center">
                        <p className="text-foreground font-semibold">Consultor de Joalherias</p>
                        <p className="text-muted-foreground text-sm mt-1.5 max-w-sm">
                          Faça perguntas sobre seus leads, performance de vendas, produtos e estratégias de atendimento
                        </p>
                      </div>
                      <div className="flex gap-2 flex-wrap justify-center max-w-lg">
                        {quickQuestions.map((q) => (
                          <button
                            key={q}
                            onClick={() => setAskQuestion(q)}
                            className="bg-zinc-50 border border-zinc-200 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600 text-muted-foreground text-xs rounded-xl px-3 py-2 transition-all"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {chatMessages.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && (
                        <div className="w-8 h-8 rounded-full bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0 mt-1">
                          <Sparkles size={14} className="text-violet-500" />
                        </div>
                      )}
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${msg.role === "user" ? "bg-violet-600 text-white rounded-br-md" : "bg-white border border-zinc-200 text-foreground rounded-bl-md"}`}>
                        {msg.role === "assistant" ? (
                          <div className="prose prose-sm max-w-none prose-p:text-foreground prose-strong:text-foreground prose-li:text-foreground prose-p:my-1 prose-headings:my-2">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <span>{msg.content}</span>
                        )}
                        <p className={`text-xs mt-2 ${msg.role === "user" ? "text-violet-200" : "text-muted-foreground"}`}>
                          {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      {msg.role === "user" && (
                        <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center shrink-0 mt-1">
                          <User size={14} className="text-zinc-500" />
                        </div>
                      )}
                    </div>
                  ))}

                  {askLoading && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-8 h-8 rounded-full bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0 mt-1">
                        <Sparkles size={14} className="text-violet-500" />
                      </div>
                      <div className="bg-white border border-zinc-200 rounded-2xl rounded-bl-md px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 size={13} className="animate-spin text-violet-500" />
                          Analisando seus dados...
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {chatMessages.length > 0 && !askLoading && (
                  <div className="flex gap-2 flex-wrap pb-3">
                    {quickQuestions.slice(0, 3).map((q) => (
                      <button
                        key={q}
                        onClick={() => setAskQuestion(q)}
                        className="bg-zinc-50 border border-zinc-200 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600 text-muted-foreground text-xs rounded-xl px-3 py-1.5 transition-all"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-zinc-200 p-3 focus-within:border-violet-300 transition-colors flex items-end gap-3">
                  <Textarea
                    placeholder="Pergunte sobre leads, produtos, performance de equipe..."
                    value={askQuestion}
                    onChange={(e) => setAskQuestion(e.target.value)}
                    className="bg-transparent border-none outline-none resize-none text-sm placeholder:text-muted-foreground min-h-[44px] max-h-[120px] focus-visible:ring-0 focus-visible:ring-offset-0 py-2"
                    rows={1}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
                  />
                  <button
                    onClick={handleAsk}
                    disabled={askLoading || !askQuestion.trim()}
                    className="bg-violet-600 hover:bg-violet-500 text-white rounded-xl p-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {askLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Script Modal */}
        <Dialog open={!!selectedScript} onOpenChange={() => setSelectedScript(null)}>
          <DialogContent className="bg-white border border-zinc-200 text-foreground max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <MessageSquarePlus size={18} className="text-violet-500" />
                Script gerado pela IA
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                Use este script para reengajar o lead via WhatsApp
              </DialogDescription>
            </DialogHeader>
            <div className="bg-zinc-50 rounded-xl p-4 text-sm text-foreground leading-relaxed border border-zinc-200 whitespace-pre-wrap">
              {selectedScript}
            </div>
            <div className="flex gap-3 justify-end mt-2">
              <button
                onClick={() => selectedScript && handleCopy(selectedScript)}
                className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 hover:border-violet-300 text-foreground hover:text-violet-600 rounded-xl px-4 py-2 text-sm transition-all"
              >
                {copied ? <><Check size={14} />Copiado!</> : <><Copy size={14} />Copiar</>}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

// ─── LeadCard ─────────────────────────────────────────────────────────────────

interface LeadCardProps {
  lead: PipelineLead;
  onNavigate: () => void;
  onGenerateScript: (id: string, name: string, product: string, hours: number, lastMsg: string, objecao?: string) => void;
  generatingScript: Record<string, boolean>;
  variant: "hot" | "warm";
}

const LeadCard: React.FC<LeadCardProps> = ({ lead, onNavigate, onGenerateScript, generatingScript, variant }) => {
  const accentClass = variant === "hot"
    ? "border-l-emerald-400 hover:border-emerald-300"
    : "border-l-amber-400 hover:border-amber-300";

  return (
    <div className={`bg-white rounded-xl border border-zinc-200 border-l-4 p-4 transition-all ${accentClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${variant === "hot" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            {getInitials(lead.contact_name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{lead.contact_name || lead.contact_phone || "Desconhecido"}</p>
            <p className={`text-xs ${lead.horas_sem_resposta > 24 ? "text-red-500" : "text-muted-foreground"}`}>
              Sem resposta há {formatHours(lead.horas_sem_resposta)}
              {lead.score_qualidade && ` · Score ${lead.score_qualidade}/10`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onNavigate}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-zinc-50 transition-all border border-transparent hover:border-zinc-200"
          >
            <ArrowUpRight size={13} />
            Ver
          </button>
          <button
            onClick={() => onGenerateScript(
              lead.conversation_id,
              lead.contact_name || "Cliente",
              lead.produto_interesse || "produto",
              lead.horas_sem_resposta,
              lead.last_message || "",
              lead.objecao_detectada || undefined,
            )}
            disabled={generatingScript[lead.conversation_id]}
            className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-violet-50 transition-all border border-violet-200 hover:border-violet-300 bg-violet-50/50"
          >
            {generatingScript[lead.conversation_id] ? <Loader2 size={13} className="animate-spin" /> : <MessageSquarePlus size={13} />}
            Reengajar
          </button>
        </div>
      </div>

      {(lead.produto_interesse || lead.objecao_detectada || lead.resumo) && (
        <div className="mt-3 space-y-2">
          {lead.resumo && (
            <p className="text-xs text-muted-foreground italic line-clamp-2">{lead.resumo}</p>
          )}
          <div className="flex gap-2 flex-wrap">
            {lead.produto_interesse && (
              <span className="bg-blue-50 border border-blue-200 text-blue-600 text-xs rounded-full px-2.5 py-0.5 inline-flex items-center gap-1">
                <Tag size={10} />
                {lead.produto_interesse}
              </span>
            )}
            {lead.objecao_detectada && (
              <span className="bg-amber-50 border border-amber-200 text-amber-600 text-xs rounded-full px-2.5 py-0.5 inline-flex items-center gap-1">
                <AlertTriangle size={10} />
                {lead.objecao_detectada}
              </span>
            )}
            {lead.sentimento && lead.sentimento !== "neutro" && (
              <span className={`text-xs rounded-full px-2.5 py-0.5 border ${lead.sentimento === "positivo" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                {lead.sentimento}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIAnalysis;
