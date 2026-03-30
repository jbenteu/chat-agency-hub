import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, AlertCircle, Info, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { ConversationLink } from "./ConversationLink";
import type { AIAnalysisImprovement } from "@/hooks/use-ai-analysis";

interface AnalysisImprovementsProps {
  improvements: AIAnalysisImprovement[];
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Crítico" },
  high: { icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-50 border-orange-200", label: "Alto" },
  medium: { icon: Info, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Médio" },
  low: { icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-50 border-blue-200", label: "Baixo" },
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

export default function AnalysisImprovements({ improvements }: AnalysisImprovementsProps) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"severity" | "occurrences">("severity");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };

  const filtered = improvements
    .filter((imp) => {
      if (categoryFilter !== "all" && imp.category !== categoryFilter) return false;
      if (severityFilter !== "all" && imp.severity !== severityFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "severity") {
        return (severityOrder[b.severity as keyof typeof severityOrder] || 0) -
          (severityOrder[a.severity as keyof typeof severityOrder] || 0);
      }
      return b.occurrence_count - a.occurrence_count;
    });

  const categories = Array.from(new Set(improvements.map((i) => i.category)));

  return (
    <div className="p-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Severidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="critical">Crítico</SelectItem>
            <SelectItem value="high">Alto</SelectItem>
            <SelectItem value="medium">Médio</SelectItem>
            <SelectItem value="low">Baixo</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-1 ml-auto">
          <Button
            variant={sortBy === "severity" ? "default" : "outline"}
            size="sm"
            onClick={() => setSortBy("severity")}
            className="h-8 text-xs"
          >
            Por Severidade
          </Button>
          <Button
            variant={sortBy === "occurrences" ? "default" : "outline"}
            size="sm"
            onClick={() => setSortBy("occurrences")}
            className="h-8 text-xs"
          >
            Por Ocorrências
          </Button>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {filtered.map((imp) => {
          const sev = SEVERITY_CONFIG[imp.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.medium;
          const SevIcon = sev.icon;
          const isExpanded = expandedId === imp.id;

          return (
            <div
              key={imp.id}
              className={`border rounded-lg overflow-hidden transition-all ${sev.bg}`}
            >
              <div
                className="flex items-start gap-3 p-4 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : imp.id)}
              >
                <SevIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${sev.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant="outline" className="text-xs py-0 h-5">
                      {CATEGORY_LABELS[imp.category] || imp.category}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs py-0 h-5 ${sev.color} border-current/30`}
                    >
                      {sev.label}
                    </Badge>
                    {imp.occurrence_count > 1 && (
                      <Badge variant="secondary" className="text-xs py-0 h-5">
                        {imp.occurrence_count}x ocorrências
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium">{imp.title}</p>
                  {!isExpanded && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{imp.description}</p>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-current/10 pt-3">
                  <p className="text-sm text-muted-foreground">{imp.description}</p>
                  {imp.example_refs && imp.example_refs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-1.5">Exemplos observados:</p>
                      <div className="flex flex-wrap gap-2">
                        {imp.example_refs.map((ref, i) => (
                          <div key={i} className="flex items-center gap-1.5 bg-background/80 rounded px-2 py-1 border text-xs">
                            <span>{ref.contact_name || "Contato"}</span>
                            {ref.excerpt && <span className="text-muted-foreground">— "{ref.excerpt.slice(0, 40)}..."</span>}
                            <ConversationLink
                              conversationId={ref.conversation_id}
                              messageId={ref.message_id}
                              variant="inline"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma orientação encontrada com os filtros selecionados.
          </div>
        )}
      </div>
    </div>
  );
}
