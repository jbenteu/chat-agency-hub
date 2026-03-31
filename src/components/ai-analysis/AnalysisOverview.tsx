import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare, BarChart3, Calendar, TrendingUp, AlertTriangle, AlertCircle, Info, ThumbsUp } from "lucide-react";
import { ScoreRadarChart, CRITERIA } from "./ScoreRadarChart";
import { ScoreDetailPopover } from "./ScoreDetailPopover";
import { ConversationLink } from "./ConversationLink";
import type { AIAnalysisRun, AIAnalysisConversation, AIAnalysisImprovement, AnalysisSummary } from "@/hooks/use-ai-analysis";

interface AnalysisOverviewProps {
  run: AIAnalysisRun;
  summary: AnalysisSummary | null;
  conversations: AIAnalysisConversation[];
  improvements: AIAnalysisImprovement[];
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900", label: "Crítico" },
  high: { icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900", label: "Alto" },
  medium: { icon: Info, color: "text-amber-600", bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900", label: "Médio" },
  low: { icon: Info, color: "text-blue-600", bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900", label: "Baixo" },
};

const CATEGORY_LABELS: Record<string, string> = {
  response_time: "Tempo de Resposta",
  empathy: "Empatia",
  product_knowledge: "Conhecimento",
  objection_handling: "Objeções",
  closing_technique: "Fechamento",
  follow_up: "Follow-up",
  geral: "Geral",
};

const scoreColor = (v: number | null) => {
  if (v === null) return "text-zinc-400";
  if (v >= 7) return "text-emerald-600";
  if (v >= 5) return "text-amber-600";
  return "text-red-500";
};

const scoreLabel = (v: number | null) => {
  if (v === null) return "—";
  if (v >= 8) return "Excelente";
  if (v >= 7) return "Bom";
  if (v >= 5) return "Regular";
  return "Crítico";
};

export default function AnalysisOverview({ run, summary, conversations, improvements }: AnalysisOverviewProps) {
  const [selectedCriterion, setSelectedCriterion] = useState<string | null>(null);

  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
  const topIssues = [...improvements]
    .sort((a, b) => (severityOrder[b.severity as keyof typeof severityOrder] || 0) - (severityOrder[a.severity as keyof typeof severityOrder] || 0))
    .slice(0, 4);

  // Top positive points from conversations
  const allPositives = conversations.flatMap((c) =>
    (c.positive_points || []).map((p) => ({ ...p, contact_name: c.contact_name, conversation_id: c.conversation_id }))
  );
  const topPositives = allPositives.slice(0, 3);

  const summaryCards = [
    {
      title: "Conversas Analisadas",
      value: summary?.total_conversations ?? run.conversations_analyzed,
      icon: MessageSquare,
      suffix: "",
    },
    {
      title: "Mensagens Processadas",
      value: summary?.total_messages ?? run.messages_analyzed,
      icon: BarChart3,
      suffix: "",
    },
    {
      title: "Score Geral",
      value: summary?.score_overall != null ? summary.score_overall.toFixed(1) : "—",
      icon: TrendingUp,
      suffix: summary?.score_overall != null ? "/10" : "",
      valueClass: scoreColor(summary?.score_overall ?? null),
    },
    {
      title: "Período",
      value: run.period_start && run.period_end
        ? `${format(new Date(run.period_start), "dd/MM", { locale: ptBR })} — ${format(new Date(run.period_end), "dd/MM/yy", { locale: ptBR })}`
        : "—",
      icon: Calendar,
      suffix: "",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">{card.title}</p>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className={`text-2xl font-bold ${card.valueClass || ""}`}>
                {card.value}
                {card.suffix && <span className="text-sm font-normal text-muted-foreground ml-0.5">{card.suffix}</span>}
              </p>
              {card.title === "Score Geral" && summary?.score_overall != null && (
                <Badge variant="outline" className={`mt-1 text-xs ${scoreColor(summary.score_overall)}`}>
                  {scoreLabel(summary.score_overall)}
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Radar + Criteria Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Scores por Critério</CardTitle>
            <p className="text-xs text-muted-foreground">Clique em um critério para ver detalhes</p>
          </CardHeader>
          <CardContent>
            {summary ? (
              <ScoreRadarChart
                summary={summary}
                onCriterionClick={setSelectedCriterion}
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                Sem dados de score
              </div>
            )}
          </CardContent>
        </Card>

        {/* Criteria Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Detalhamento por Critério</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {CRITERIA.map(({ key, label }) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const score = summary ? (summary as any)[key] as number | null : null;
              const isSelected = selectedCriterion === key;
              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/50"}`}
                  onClick={() => setSelectedCriterion(isSelected ? null : key)}
                >
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{label}</span>
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-bold ${scoreColor(score)}`}>
                          {score != null ? score.toFixed(1) : "—"}
                        </span>
                        <ScoreDetailPopover
                          criterionKey={key}
                          criterionLabel={label}
                          conversations={conversations}
                        />
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          score === null ? "" :
                          score >= 7 ? "bg-emerald-500" :
                          score >= 5 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: score != null ? `${(score / 10) * 100}%` : "0%" }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Score Distribution */}
      {conversations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Distribuição de Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { label: "Alto (7-10)", count: conversations.filter((c) => (c.score_overall ?? 0) >= 7).length, color: "text-emerald-600" },
                { label: "Médio (5-7)", count: conversations.filter((c) => { const s = c.score_overall ?? 0; return s >= 5 && s < 7; }).length, color: "text-amber-600" },
                { label: "Baixo (0-5)", count: conversations.filter((c) => (c.score_overall ?? 0) < 5 && c.score_overall != null).length, color: "text-red-500" },
              ].map((bucket) => (
                <div key={bucket.label} className="space-y-1">
                  <p className={`text-2xl font-bold ${bucket.color}`}>{bucket.count}</p>
                  <p className="text-xs text-muted-foreground">{bucket.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Issues with real examples */}
      {topIssues.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Principais Pontos de Atenção</CardTitle>
            <p className="text-xs text-muted-foreground">Issues identificados com maior impacto no atendimento</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {topIssues.map((imp, i) => {
              const sev = SEVERITY_CONFIG[imp.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.medium;
              const SevIcon = sev.icon;
              return (
                <div key={i} className={`border rounded-lg p-3 ${sev.bg}`}>
                  <div className="flex items-start gap-2 mb-1.5">
                    <SevIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${sev.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <Badge variant="outline" className="text-xs py-0 h-5">{CATEGORY_LABELS[imp.category] || imp.category}</Badge>
                        <Badge variant="outline" className={`text-xs py-0 h-5 ${sev.color}`}>{sev.label}</Badge>
                        {imp.occurrence_count > 1 && (
                          <span className="text-xs text-muted-foreground">{imp.occurrence_count}x observado</span>
                        )}
                      </div>
                      <p className="text-sm font-medium">{imp.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{imp.description}</p>
                    </div>
                  </div>
                  {imp.example_refs && imp.example_refs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 pl-6">
                      {imp.example_refs.slice(0, 2).map((ref, j) => (
                        <div key={j} className="flex items-center gap-1 bg-background/70 rounded px-2 py-0.5 border text-xs">
                          <span className="text-muted-foreground">Ex:</span>
                          <span>{ref.contact_name || "Contato"}</span>
                          <ConversationLink conversationId={ref.conversation_id} messageId={ref.message_id} variant="inline" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Top Positive Points */}
      {topPositives.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-emerald-600" />
              Destaques Positivos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topPositives.map((p, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{p.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-muted-foreground">Em:</span>
                    <span className="text-xs">{p.contact_name}</span>
                    <ConversationLink conversationId={p.conversation_id} variant="inline" />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
