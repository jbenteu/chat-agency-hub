import React, { useEffect, useState, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import ReactMarkdown from "react-markdown";
import { useAIAnalysis, type AIDashboardData } from "@/hooks/use-ai-analysis";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  RefreshCw, Copy, Sparkles, Check,
  LayoutDashboard, AlertCircle, BarChart2, Star,
  MessageSquareWarning, TrendingUp, MessageSquare, Flame,
  ArrowUpRight, MessageSquarePlus, Loader2, Tag, AlertTriangle,
  ChevronDown, Wand2, CheckCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const statusColors: Record<string, string> = {
  quente: "bg-emerald-50 border-emerald-200 text-emerald-700",
  morno: "bg-amber-50 border-amber-200 text-amber-700",
  frio: "bg-zinc-100 border-zinc-200 text-zinc-500",
  perdido: "bg-red-50 border-red-200 text-red-700",
};

const sentimentoColors: Record<string, string> = {
  positivo: "bg-emerald-50 border-emerald-200 text-emerald-700",
  neutro: "bg-zinc-100 border-zinc-200 text-zinc-500",
  frustrado: "bg-red-50 border-red-200 text-red-700",
};

const scoreBarColor = (v: number | null) => {
  if (v === null) return "bg-zinc-200";
  if (v >= 7) return "bg-emerald-500";
  if (v >= 5) return "bg-amber-500";
  return "bg-red-500";
};

const scoreTextColor = (v: number | null) => {
  if (v === null) return "text-zinc-400";
  if (v >= 7) return "text-emerald-600";
  if (v >= 5) return "text-amber-600";
  return "text-red-600";
};

const formatHours = (h: number) => {
  if (h < 24) return `${Math.round(h)}h`;
  const d = Math.floor(h / 24);
  const rem = Math.round(h % 24);
  return rem > 0 ? `${d}d ${rem}h` : `${d}d`;
};

const scoreLabels: Record<string, string> = {
  empatia: "Empatia e cordialidade",
  clareza: "Clareza na oferta",
  velocidade: "Velocidade de resposta",
  followup: "Follow-up pós-orçamento",
  contorno_objecao: "Contorno de objeções",
  cta: "CTA para fechamento",
  personalizacao: "Personalização",
};

const quickQuestions = [
  "Qual o melhor horário para responder leads?",
  "Quais objeções precisam de mais atenção?",
  "Como está a qualidade geral do atendimento?",
  "Quais produtos têm mais interesse este mês?",
  "O que estamos fazendo bem e o que melhorar?",
];

const tabItems = [
  { value: "visao-geral", label: "Visão Geral", icon: LayoutDashboard },
  { value: "leads-perdidos", label: "Leads Perdidos", icon: AlertCircle },
  { value: "scores", label: "Scores", icon: BarChart2 },
  { value: "melhores", label: "Melhores Abordagens", icon: Star },
  { value: "objecoes", label: "Objeções", icon: MessageSquareWarning },
  { value: "perguntar", label: "Perguntar à IA", icon: Sparkles },
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

const AIAnalysis: React.FC = () => {
  const { getDashboard, generateScript, askAI } = useAIAnalysis();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [dashboardData, setDashboardData] = useState<AIDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [askQuestion, setAskQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [generatingScript, setGeneratingScript] = useState<Record<string, boolean>>({});
  const [generatedScripts, setGeneratedScripts] = useState<Record<string, string>>({});
  const [selectedScript, setSelectedScript] = useState<string | null>(null);
  const [scoresData, setScoresData] = useState<ScoresRow[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [objectionScripts, setObjectionScripts] = useState<string[]>([]);
  const [objectionLoading, setObjectionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("visao-geral");
  const [copied, setCopied] = useState(false);

  const loadDashboard = async (force = false) => {
    try {
      setLoading(true);
      const result = await getDashboard(force);
      setDashboardData(result.data);
    } catch (err) {
      toast({
        title: "Erro ao carregar dados",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
        .limit(30);

      if (!data || data.length === 0) {
        setScoresData([]);
        return;
      }

      const convIds = data.map((d: any) => d.conversation_id);
      const { data: convs } = await supabase
        .from("whatsapp_conversations")
        .select("id, contact_name, contact_phone")
        .in("id", convIds);

      const convMap: Record<string, { contact_name: string | null; contact_phone: string | null }> = {};
      (convs || []).forEach((c: any) => { convMap[c.id] = c; });

      setScoresData(
        data.map((d: any) => ({
          ...d,
          contact_name: convMap[d.conversation_id]?.contact_name || null,
          contact_phone: convMap[d.conversation_id]?.contact_phone || null,
        })),
      );
    } catch {
      // silent
    } finally {
      setScoresLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === "scores") loadScores();
  };

  const handleAsk = async () => {
    if (!askQuestion.trim()) return;
    try {
      setAskLoading(true);
      setAiAnswer(null);
      const result = await askAI(askQuestion);
      setAiAnswer(result.answer);
    } catch (err) {
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao consultar IA",
        variant: "destructive",
      });
    } finally {
      setAskLoading(false);
    }
  };

  const handleGenerateScript = async (
    leadId: string,
    leadName: string,
    productInterest: string,
    hoursWithoutReply: number,
    lastMessage: string,
    objecao?: string,
  ) => {
    try {
      setGeneratingScript((p) => ({ ...p, [leadId]: true }));
      const result = await generateScript({
        lead_name: leadName,
        product_interest: productInterest,
        hours_without_reply: hoursWithoutReply,
        last_message: lastMessage,
        objecao,
      });
      setGeneratedScripts((p) => ({ ...p, [leadId]: result.script }));
      setSelectedScript(result.script);
    } catch (err) {
      toast({ title: "Erro", description: "Falha ao gerar script", variant: "destructive" });
    } finally {
      setGeneratingScript((p) => ({ ...p, [leadId]: false }));
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copiado!", description: "Texto copiado para a área de transferência" });
  };

  const handleObjectionScripts = async () => {
    if (!dashboardData?.top_objecoes?.length) return;
    try {
      setObjectionLoading(true);
      const top3 = dashboardData.top_objecoes.slice(0, 3);
      const results = await Promise.all(
        top3.map((o) =>
          generateScript({
            lead_name: "Cliente",
            product_interest: "joias",
            hours_without_reply: 24,
            last_message: "",
            objecao: o.objecao_detectada,
          }),
        ),
      );
      setObjectionScripts(results.map((r) => r.script));
    } catch {
      toast({ title: "Erro", description: "Falha ao gerar scripts", variant: "destructive" });
    } finally {
      setObjectionLoading(false);
    }
  };

  const isEmpty =
    !dashboardData ||
    (dashboardData.total_conversas_mes === 0 &&
      !dashboardData.score_medio &&
      dashboardData.leads_sem_resposta_lista.length === 0);

  const allScoresNull = dashboardData && dashboardData.total_conversas_mes > 0 && !dashboardData.score_medio &&
    dashboardData.media_scores && Object.values(dashboardData.media_scores).every(v => v === null);

  const leadsCount = dashboardData?.leads_sem_resposta ?? 0;

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start pb-6 border-b border-zinc-200">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Análise de IA</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
              <Sparkles className="text-violet-500" size={12} />
              Atualizado automaticamente
            </p>
          </div>
          <div className="flex items-center gap-3">
            {dashboardData && (
              <span className="text-xs bg-zinc-100 border border-zinc-200 rounded-full px-3 py-1 text-muted-foreground">
                Atualizado: {new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDashboard(true)}
              disabled={loading}
              className="border-zinc-200 text-muted-foreground hover:bg-zinc-50 hover:text-foreground hover:border-violet-400 transition-all"
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar dados
            </Button>
          </div>
        </div>

        {isEmpty && !loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Sparkles className="text-violet-500" size={40} />
            <p className="text-foreground font-medium">Nenhuma conversa analisada ainda</p>
            <p className="text-muted-foreground text-sm">As análises são geradas automaticamente conforme novas mensagens chegam.</p>
          </div>
        ) : (
          <>
            {/* Tabs Navigation */}
            <div className="bg-zinc-100 rounded-xl p-1 flex gap-1 flex-wrap">
              {tabItems.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => handleTabChange(tab.value)}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-all cursor-pointer ${
                      isActive
                        ? "bg-white text-foreground font-medium border border-zinc-200 shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/60 border border-transparent"
                    }`}
                  >
                    <Icon size={14} />
                    {tab.label}
                    {tab.value === "leads-perdidos" && leadsCount > 0 && (
                      <span className="bg-red-100 text-red-600 text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-medium">
                        {leadsCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Visão Geral ── */}
            {activeTab === "visao-geral" && (
              <div className="space-y-6">
                {allScoresNull && (
                  <div className="flex items-start gap-3 bg-violet-50 border border-violet-200 rounded-xl p-4">
                    <Sparkles className="text-violet-500 mt-0.5 flex-shrink-0" size={20} />
                    <div>
                      <p className="text-sm font-medium text-violet-700">Análises em processamento</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        O sistema detectou {dashboardData?.total_conversas_mes} conversas. As análises de IA são geradas
                        automaticamente conforme novas mensagens chegam.
                        Você pode forçar uma análise clicando em "Atualizar dados".
                      </p>
                    </div>
                  </div>
                )}

                {/* Metric Cards */}
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
                      {/* Score de qualidade */}
                      <div className={`bg-white rounded-xl border border-zinc-200 p-5 hover:border-zinc-300 transition-all border-l-2 ${
                        dashboardData?.score_medio == null ? "border-l-zinc-300" :
                        dashboardData.score_medio >= 7 ? "border-l-emerald-500" :
                        dashboardData.score_medio >= 5 ? "border-l-amber-500" : "border-l-red-500"
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">Score de qualidade</span>
                          <TrendingUp size={14} className="text-zinc-400" />
                        </div>
                        <p className={`text-3xl font-bold mt-2 ${
                          dashboardData?.score_medio == null ? "text-zinc-400" : scoreTextColor(dashboardData.score_medio)
                        }`}>
                          {dashboardData?.score_medio ? `${dashboardData.score_medio.toFixed(1)}/10` : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Média dos últimos 30 dias</p>
                      </div>

                      {/* Leads sem resposta */}
                      <div className={`bg-white rounded-xl border border-zinc-200 p-5 hover:border-zinc-300 transition-all border-l-2 ${
                        leadsCount >= 10 ? "border-l-red-500" : leadsCount >= 5 ? "border-l-amber-500" : "border-l-emerald-500"
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">Leads sem resposta</span>
                          <AlertCircle size={14} className="text-zinc-400" />
                        </div>
                        <p className={`text-3xl font-bold mt-2 ${
                          leadsCount >= 10 ? "text-red-600" : leadsCount >= 5 ? "text-amber-600" : "text-emerald-600"
                        }`}>
                          {leadsCount}
                        </p>
                        {leadsCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 rounded-full px-2 py-0.5 border border-red-200 mt-1">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                            Requer atenção
                          </span>
                        )}
                      </div>

                      {/* Conversas este mês */}
                      <div className="bg-white rounded-xl border border-zinc-200 p-5 hover:border-zinc-300 transition-all border-l-2 border-l-blue-500">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">Conversas este mês</span>
                          <MessageSquare size={14} className="text-zinc-400" />
                        </div>
                        <p className="text-3xl font-bold mt-2 text-blue-600">
                          {dashboardData?.total_conversas_mes ?? 0}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">conversas ativas</p>
                      </div>

                      {/* Leads quentes */}
                      <div className="bg-white rounded-xl border border-zinc-200 p-5 hover:border-zinc-300 transition-all border-l-2 border-l-emerald-500">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">Leads quentes</span>
                          <Flame size={14} className="text-zinc-400" />
                        </div>
                        <p className={`text-3xl font-bold mt-2 ${
                          (dashboardData?.leads_por_status?.quente ?? 0) > 0 ? "text-emerald-600" : "text-zinc-400"
                        }`}>
                          {dashboardData?.leads_por_status?.quente ?? 0}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">prontos para fechar</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Score Bars */}
                {!loading && dashboardData?.media_scores && (
                  <div className="bg-white rounded-xl border border-zinc-200 p-6">
                    <div className="mb-4">
                      <h3 className="text-sm font-medium text-foreground">Scores médios (30 dias)</h3>
                      <p className="text-xs text-muted-foreground">Baseado em análise de IA das conversas</p>
                    </div>
                    {Object.entries(scoreLabels).map(([key, label], idx) => {
                      const val = dashboardData.media_scores[key as keyof typeof dashboardData.media_scores];
                      const pct = val ? (val / 10) * 100 : 0;
                      return (
                        <div
                          key={key}
                          className={`flex items-center gap-4 py-2.5 ${
                            idx < Object.keys(scoreLabels).length - 1 ? "border-b border-zinc-100" : ""
                          }`}
                        >
                          <span className="text-sm text-muted-foreground w-48 shrink-0">{label}</span>
                          <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${scoreBarColor(val)}`}
                              style={{ width: val ? `${pct}%` : "0%" }}
                            />
                          </div>
                          <span className={`text-sm font-medium w-12 text-right ${scoreTextColor(val)}`}>
                            {val?.toFixed(1) ?? "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Leads Perdidos ── */}
            {activeTab === "leads-perdidos" && (
              <div className="space-y-3">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="bg-white rounded-xl border border-zinc-200 p-5 animate-pulse">
                      <div className="h-4 w-40 bg-zinc-100 rounded mb-3" />
                      <div className="h-3 w-64 bg-zinc-100 rounded" />
                    </div>
                  ))
                ) : !dashboardData?.leads_sem_resposta_lista?.length ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <CheckCircle className="text-emerald-500" size={40} />
                    <p className="text-foreground font-medium">Nenhum lead perdido no momento</p>
                    <p className="text-muted-foreground text-sm">Todos os leads foram respondidos nas últimas 2 horas</p>
                  </div>
                ) : (
                  dashboardData.leads_sem_resposta_lista.map((lead) => {
                    const hoursColor = lead.horas_sem_resposta > 48 ? "text-red-600" : lead.horas_sem_resposta > 24 ? "text-amber-600" : "text-muted-foreground";
                    return (
                      <div
                        key={lead.id}
                        className="bg-white rounded-xl border border-zinc-200 p-4 hover:border-zinc-300 transition-all group"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {lead.contact_name || lead.contact_phone || "Desconhecido"}
                              </span>
                              {lead.status_lead && (
                                <span className={`text-xs rounded-full px-2.5 py-0.5 border font-medium inline-flex items-center gap-1 ${statusColors[lead.status_lead] || ""}`}>
                                  {lead.status_lead === "quente" && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />}
                                  {lead.status_lead}
                                </span>
                              )}
                            </div>
                            <p className={`text-xs mt-1 ${hoursColor}`}>
                              Sem resposta há {formatHours(lead.horas_sem_resposta)}
                            </p>
                            {lead.last_message && (
                              <p className="text-xs text-muted-foreground mt-1 italic line-clamp-1 max-w-md">
                                {lead.last_message}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => navigate("/whatsapp")}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-zinc-50 transition-all"
                            >
                              <ArrowUpRight size={14} />
                              Ver conversa
                            </button>
                            <button
                              onClick={() =>
                                handleGenerateScript(
                                  lead.id,
                                  lead.contact_name || "Cliente",
                                  lead.produto_interesse || "produto",
                                  lead.horas_sem_resposta,
                                  lead.last_message || "",
                                  lead.objecao_detectada || undefined,
                                )
                              }
                              disabled={generatingScript[lead.id]}
                              className="flex items-center gap-1 text-xs bg-violet-50 border border-violet-200 text-violet-600 hover:bg-violet-100 hover:border-violet-300 px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50"
                            >
                              {generatingScript[lead.id] ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <MessageSquarePlus size={14} />
                              )}
                              Reengajar
                            </button>
                          </div>
                        </div>
                        {(lead.produto_interesse || lead.objecao_detectada) && (
                          <div className="mt-3 flex gap-2 flex-wrap">
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
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── Scores ── */}
            {activeTab === "scores" && (
              <div className="space-y-3">
                {scoresLoading ? (
                  <div className="bg-white rounded-xl border border-zinc-200 p-6 animate-pulse">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-10 bg-zinc-100 rounded-xl mb-3 last:mb-0" />
                    ))}
                  </div>
                ) : scoresData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <BarChart2 className="text-zinc-400" size={40} />
                    <p className="text-foreground font-medium">Nenhuma análise disponível ainda</p>
                    <p className="text-muted-foreground text-sm">As análises serão exibidas aqui após o processamento</p>
                  </div>
                ) : (
                  scoresData.map((row) => (
                    <div key={row.id}>
                      <div
                        className="bg-white rounded-xl border border-zinc-200 px-4 py-3 hover:border-zinc-300 cursor-pointer transition-all flex items-center gap-4"
                        onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
                      >
                        <div className="w-8 h-8 bg-zinc-100 border border-zinc-200 rounded-full flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                          {getInitials(row.contact_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{row.contact_name || "—"}</p>
                          <p className="text-xs text-muted-foreground truncate">{row.contact_phone || ""}</p>
                        </div>
                        {row.sentimento && (
                          <span className={`text-xs rounded-full px-2.5 py-0.5 border font-medium shrink-0 ${sentimentoColors[row.sentimento] || ""}`}>
                            {row.sentimento}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground truncate max-w-32 hidden md:block">{row.produto_interesse || "—"}</span>
                        <span className={`text-lg font-bold shrink-0 ${scoreTextColor(row.score_qualidade)}`}>
                          {row.score_qualidade ?? "—"}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                          {new Date(row.analyzed_at).toLocaleDateString("pt-BR")}
                        </span>
                        <ChevronDown size={16} className={`text-zinc-400 ml-auto shrink-0 transition-transform duration-200 ${expandedRow === row.id ? "rotate-180" : ""}`} />
                      </div>
                      {expandedRow === row.id && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                          {Object.entries(scoreLabels).map(([key, label]) => {
                            const scoreKey = `score_${key}` as keyof typeof row;
                            const val = row[scoreKey] as number | null;
                            return (
                              <div key={key} className="text-center bg-zinc-50 rounded-lg p-3">
                                <p className={`text-xl font-bold ${scoreTextColor(val)}`}>{val ?? "—"}</p>
                                <p className="text-xs text-muted-foreground mt-1">{label}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Melhores Abordagens ── */}
            {activeTab === "melhores" && (
              <div>
                {loading ? (
                  <div className="bg-white rounded-xl border border-zinc-200 p-6 animate-pulse">
                    <div className="h-6 w-48 bg-zinc-100 rounded mb-4" />
                    <div className="h-20 bg-zinc-100 rounded" />
                  </div>
                ) : !dashboardData?.melhores_abordagens?.length ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Star className="text-zinc-400" size={40} />
                    <p className="text-foreground font-medium">Nenhuma abordagem com score alto ainda</p>
                    <p className="text-muted-foreground text-sm">Abordagens de destaque aparecerão aqui</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {dashboardData.melhores_abordagens.map((item, i) => (
                      <div
                        key={i}
                        className="bg-white rounded-xl border border-zinc-200 p-5 hover:border-violet-300 transition-all group"
                      >
                        <div className="flex justify-between items-start">
                          <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-sm rounded-lg px-2.5 py-1">
                            ★ {item.score_qualidade}/10
                          </span>
                          {item.produto_interesse && (
                            <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5">
                              {item.produto_interesse}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground leading-relaxed mt-3">
                          {item.resumo || "Sem resumo"}
                        </p>
                        <div className="border-t border-zinc-100 my-3" />
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Conversa de {item.contact_name || "Contato"}</span>
                          <button
                            onClick={() =>
                              handleGenerateScript(
                                `best-${i}`,
                                item.contact_name || "Cliente",
                                item.produto_interesse || "produto",
                                0,
                                item.resumo || "",
                              )
                            }
                            disabled={generatingScript[`best-${i}`]}
                            className="text-xs text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 hover:border-violet-300 rounded-lg px-3 py-1.5 transition-all disabled:opacity-50"
                          >
                            {generatingScript[`best-${i}`] ? <Loader2 size={12} className="animate-spin" /> : "Usar como modelo"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Objeções ── */}
            {activeTab === "objecoes" && (
              <div className="space-y-6">
                {loading ? (
                  <div className="bg-white rounded-xl border border-zinc-200 p-6 animate-pulse">
                    <div className="h-6 w-48 bg-zinc-100 rounded mb-4" />
                    <div className="h-32 bg-zinc-100 rounded" />
                  </div>
                ) : (
                  <>
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Objeções */}
                      <div className="bg-white rounded-xl border border-zinc-200 p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-medium text-foreground">Objeções mais comuns</h3>
                          <span className="text-xs bg-zinc-100 rounded-full px-2 py-0.5 text-muted-foreground">
                            {dashboardData?.top_objecoes?.length ?? 0}
                          </span>
                        </div>
                        {dashboardData?.top_objecoes?.length ? (
                          (() => {
                            const maxCount = dashboardData.top_objecoes[0]?.count || 1;
                            return dashboardData.top_objecoes.map((o, i) => (
                              <div
                                key={i}
                                className={`flex items-center gap-3 py-2.5 ${
                                  i < dashboardData.top_objecoes.length - 1 ? "border-b border-zinc-100" : ""
                                }`}
                              >
                                <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                                <span className="text-sm text-foreground flex-1">{o.objecao_detectada}</span>
                                <div className="h-1 bg-zinc-100 rounded w-24">
                                  <div
                                    className="h-full bg-red-400 rounded"
                                    style={{ width: `${(o.count / maxCount) * 100}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground w-8 text-right">{o.count}</span>
                              </div>
                            ));
                          })()
                        ) : (
                          <p className="text-sm text-muted-foreground">Sem dados</p>
                        )}
                      </div>

                      {/* Produtos */}
                      <div className="bg-white rounded-xl border border-zinc-200 p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-medium text-foreground">Produtos com interesse</h3>
                          <span className="text-xs bg-zinc-100 rounded-full px-2 py-0.5 text-muted-foreground">
                            {dashboardData?.top_produtos?.length ?? 0}
                          </span>
                        </div>
                        {dashboardData?.top_produtos?.length ? (
                          (() => {
                            const maxCount = dashboardData.top_produtos[0]?.count || 1;
                            return dashboardData.top_produtos.map((p, i) => (
                              <div
                                key={i}
                                className={`flex items-center gap-3 py-2.5 ${
                                  i < dashboardData.top_produtos.length - 1 ? "border-b border-zinc-100" : ""
                                }`}
                              >
                                <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                                <span className="text-sm text-foreground flex-1">{p.produto_interesse}</span>
                                <div className="h-1 bg-zinc-100 rounded w-24">
                                  <div
                                    className="h-full bg-blue-400 rounded"
                                    style={{ width: `${(p.count / maxCount) * 100}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground w-8 text-right">{p.count}</span>
                              </div>
                            ));
                          })()
                        ) : (
                          <p className="text-sm text-muted-foreground">Sem dados</p>
                        )}
                      </div>
                    </div>

                    {/* Scripts de contorno */}
                    {dashboardData?.top_objecoes && dashboardData.top_objecoes.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <button
                            onClick={handleObjectionScripts}
                            disabled={objectionLoading}
                            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                          >
                            {objectionLoading ? (
                              <>
                                <Loader2 size={16} className="animate-spin" />
                                Gerando...
                              </>
                            ) : (
                              <>
                                <Wand2 size={16} />
                                Gerar scripts para top 3 objeções
                              </>
                            )}
                          </button>
                        </div>
                        {objectionScripts.length > 0 && (
                          <div className="grid md:grid-cols-3 gap-4">
                            {objectionScripts.map((script, i) => (
                              <div key={i} className="bg-white rounded-xl border border-zinc-200 p-5">
                                <p className="text-xs text-muted-foreground mb-3 font-medium">
                                  {dashboardData.top_objecoes[i]?.objecao_detectada || `Objeção ${i + 1}`}
                                </p>
                                <div className="text-sm text-foreground bg-zinc-50 rounded-lg p-3 font-mono text-xs whitespace-pre-wrap">
                                  {script}
                                </div>
                                <button
                                  onClick={() => handleCopy(script)}
                                  className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-all"
                                >
                                  <Copy size={12} />
                                  Copiar
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Perguntar à IA ── */}
            {activeTab === "perguntar" && (
              <div className="max-w-2xl mx-auto space-y-4">
                <div className="bg-white rounded-2xl border border-zinc-200 p-4 focus-within:border-violet-300 transition-colors">
                  <Textarea
                    placeholder="Ex: Como melhorar a conversão dos leads de noivado?"
                    value={askQuestion}
                    onChange={(e) => setAskQuestion(e.target.value)}
                    className="bg-transparent border-none outline-none resize-none text-sm text-foreground placeholder:text-muted-foreground min-h-[80px] focus-visible:ring-0 focus-visible:ring-offset-0"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); }
                    }}
                  />
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-zinc-100">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Sparkles size={10} className="text-violet-500" />
                      Análise inteligente
                    </span>
                    <button
                      onClick={handleAsk}
                      disabled={askLoading || !askQuestion.trim()}
                      className="bg-violet-600 hover:bg-violet-500 text-white rounded-xl px-4 py-2 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {askLoading ? <Loader2 size={14} className="animate-spin" /> : "Perguntar"}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {quickQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => setAskQuestion(q)}
                      className="bg-zinc-50 border border-zinc-200 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600 text-muted-foreground text-xs rounded-full px-3 py-1.5 transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {aiAnswer !== null && (
                  <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3 bg-zinc-50 border-b border-zinc-200">
                      <Sparkles size={14} className="text-violet-500" />
                      <span className="text-sm font-medium text-foreground">Resposta da IA</span>
                    </div>
                    <div className="p-5 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {aiAnswer}
                    </div>
                  </div>
                )}
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
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => selectedScript && handleCopy(selectedScript)}
                className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 hover:border-violet-300 text-foreground hover:text-violet-600 rounded-xl px-4 py-2 text-sm transition-all"
              >
                {copied ? (
                  <>
                    <Check size={14} />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copiar texto
                  </>
                )}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default AIAnalysis;
