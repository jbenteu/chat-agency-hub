import React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import { ConversationLink } from "./ConversationLink";
import type { AIAnalysisConversation } from "@/hooks/use-ai-analysis";

interface ScoreDetailPopoverProps {
  criterionKey: string;
  criterionLabel: string;
  conversations: AIAnalysisConversation[];
}

const scoreColor = (v: number | null) => {
  if (v === null) return "text-zinc-400";
  if (v >= 7) return "text-emerald-600";
  if (v >= 5) return "text-amber-600";
  return "text-red-500";
};

const CRITERION_DETAIL_MAP: Record<string, keyof AIAnalysisConversation["details"]> = {
  score_response_time: "response_time",
  score_empathy: "empathy",
  score_product_knowledge: "product_knowledge",
  score_objection_handling: "objection_handling",
  score_closing_technique: "closing_technique",
  score_follow_up: "follow_up",
};

export function ScoreDetailPopover({ criterionKey, criterionLabel, conversations }: ScoreDetailPopoverProps) {
  const detailKey = CRITERION_DETAIL_MAP[criterionKey];

  const topConvs = conversations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((c) => (c as any)[criterionKey] != null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a, b) => ((a as any)[criterionKey] || 0) - ((b as any)[criterionKey] || 0))
    .slice(0, 5);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <Info className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" side="right">
        <p className="text-sm font-semibold mb-2">{criterionLabel}</p>
        <div className="space-y-2">
          {topConvs.map((conv) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const score = (conv as any)[criterionKey] as number | null;
            const detail = detailKey ? conv.details[detailKey] : undefined;
            return (
              <div key={conv.id} className="border rounded p-2 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate flex-1">{conv.contact_name || "Desconhecido"}</span>
                  <span className={`font-bold ${scoreColor(score)}`}>{score ?? "–"}/10</span>
                </div>
                {detail?.observations?.[0] && (
                  <p className="text-muted-foreground text-xs">{detail.observations[0]}</p>
                )}
                <ConversationLink conversationId={conv.conversation_id} contactName={conv.contact_name} variant="inline" />
              </div>
            );
          })}
          {topConvs.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma evidência disponível.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
