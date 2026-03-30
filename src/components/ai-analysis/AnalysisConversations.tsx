import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Search, MessageSquare } from "lucide-react";
import { ConversationLink } from "./ConversationLink";
import type { AIAnalysisConversation } from "@/hooks/use-ai-analysis";

interface AnalysisConversationsProps {
  conversations: AIAnalysisConversation[];
}

const SCORE_KEYS = [
  { key: "score_response_time", short: "Resp." },
  { key: "score_empathy", short: "Empatia" },
  { key: "score_product_knowledge", short: "Produto" },
  { key: "score_objection_handling", short: "Obj." },
  { key: "score_closing_technique", short: "Fech." },
  { key: "score_follow_up", short: "Follow" },
];

const scoreColor = (v: number | null) => {
  if (v === null) return "bg-zinc-100 text-zinc-400";
  if (v >= 7) return "bg-emerald-50 text-emerald-700";
  if (v >= 5) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
};

const overallColor = (v: number | null) => {
  if (v === null) return "text-zinc-400";
  if (v >= 7) return "text-emerald-600";
  if (v >= 5) return "text-amber-600";
  return "text-red-500";
};

type ScoreFilter = "all" | "high" | "medium" | "low";

export default function AnalysisConversations({ conversations }: AnalysisConversationsProps) {
  const [search, setSearch] = useState("");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [sortBy, setSortBy] = useState<string>("score_overall");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = conversations
    .filter((c) => {
      const name = (c.contact_name || "").toLowerCase();
      const phone = (c.contact_phone || "").toLowerCase();
      if (search && !name.includes(search.toLowerCase()) && !phone.includes(search.toLowerCase())) return false;
      if (scoreFilter === "high" && (c.score_overall ?? 0) < 7) return false;
      if (scoreFilter === "medium" && ((c.score_overall ?? 0) < 5 || (c.score_overall ?? 0) >= 7)) return false;
      if (scoreFilter === "low" && ((c.score_overall ?? 10) >= 5)) return false;
      return true;
    })
    .sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const av = (a as any)[sortBy] ?? -1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bv = (b as any)[sortBy] ?? -1;
      return sortAsc ? av - bv : bv - av;
    });

  const handleSort = (key: string) => {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(false); }
  };

  return (
    <div className="p-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "high", "medium", "low"] as ScoreFilter[]).map((f) => (
            <Button
              key={f}
              variant={scoreFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setScoreFilter(f)}
              className="h-8 text-xs"
            >
              {f === "all" ? "Todos" : f === "high" ? "Alto" : f === "medium" ? "Médio" : "Baixo"}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium text-xs text-muted-foreground">Contato</th>
                {SCORE_KEYS.map(({ key, short }) => (
                  <th
                    key={key}
                    className="text-center p-3 font-medium text-xs text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap"
                    onClick={() => handleSort(key)}
                  >
                    {short}
                    {sortBy === key && (sortAsc ? <ChevronUp className="inline h-3 w-3 ml-0.5" /> : <ChevronDown className="inline h-3 w-3 ml-0.5" />)}
                  </th>
                ))}
                <th
                  className="text-center p-3 font-medium text-xs text-muted-foreground cursor-pointer hover:text-foreground"
                  onClick={() => handleSort("score_overall")}
                >
                  Geral
                  {sortBy === "score_overall" && (sortAsc ? <ChevronUp className="inline h-3 w-3 ml-0.5" /> : <ChevronDown className="inline h-3 w-3 ml-0.5" />)}
                </th>
                <th className="text-right p-3 font-medium text-xs text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((conv) => (
                <React.Fragment key={conv.id}>
                  <tr
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === conv.id ? null : conv.id)}
                  >
                    <td className="p-3">
                      <div className="font-medium text-xs">{conv.contact_name || "Desconhecido"}</div>
                      {conv.contact_phone && (
                        <div className="text-xs text-muted-foreground">{conv.contact_phone}</div>
                      )}
                      <div className="flex items-center gap-1 mt-0.5">
                        <MessageSquare className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{conv.messages_count} msgs</span>
                      </div>
                    </td>
                    {SCORE_KEYS.map(({ key }) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const score = (conv as any)[key] as number | null;
                      return (
                        <td key={key} className="p-3 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${scoreColor(score)}`}>
                            {score != null ? score.toFixed(1) : "—"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="p-3 text-center">
                      <span className={`text-base font-bold ${overallColor(conv.score_overall)}`}>
                        {conv.score_overall != null ? conv.score_overall.toFixed(1) : "—"}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ConversationLink conversationId={conv.conversation_id} contactName={conv.contact_name} />
                        {expandedId === conv.id ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedId === conv.id && (
                    <tr>
                      <td colSpan={9} className="bg-muted/20 p-4">
                        <ConversationDetails conv={conv} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma conversa encontrada com os filtros selecionados.
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationDetails({ conv }: { conv: AIAnalysisConversation }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Positive Points */}
      {conv.positive_points && conv.positive_points.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-emerald-700 mb-2">Pontos Positivos</h4>
          <ul className="space-y-1.5">
            {conv.positive_points.map((p, i) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-2">
                <span className="text-emerald-500 mt-0.5">✓</span>
                <div>
                  <span className="font-medium text-foreground">{p.title}: </span>
                  {p.description}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvement Points */}
      {conv.improvement_points && conv.improvement_points.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-amber-700 mb-2">Pontos de Melhoria</h4>
          <ul className="space-y-1.5">
            {conv.improvement_points.map((p, i) => (
              <li key={i} className="text-xs text-muted-foreground flex gap-2">
                <span className={`mt-0.5 ${p.severity === "critical" || p.severity === "high" ? "text-red-500" : "text-amber-500"}`}>!</span>
                <div>
                  <span className="font-medium text-foreground">{p.title}: </span>
                  {p.description}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
