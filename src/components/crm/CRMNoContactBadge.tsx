import React from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface CRMNoContactBadgeProps {
  lastContactAt: string | null;
  thresholdDays?: number;
  className?: string;
}

export function CRMNoContactBadge({
  lastContactAt,
  thresholdDays = 3,
  className,
}: CRMNoContactBadgeProps) {
  if (!lastContactAt) {
    return (
      <span className={cn("flex items-center gap-1 text-[10px] text-muted-foreground", className)}>
        <Clock className="h-3 w-3" />
        Sem contato
      </span>
    );
  }

  const last = new Date(lastContactAt);
  const diffMs = Date.now() - last.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const isOverThreshold = diffDays > thresholdDays;

  const label = formatDistanceToNow(last, { locale: ptBR, addSuffix: false });

  return (
    <span
      className={cn(
        "flex items-center gap-1 text-[10px]",
        isOverThreshold
          ? "text-red-600 dark:text-red-400 font-medium"
          : "text-muted-foreground",
        className
      )}
    >
      <Clock className="h-3 w-3 flex-shrink-0" />
      {isOverThreshold ? `Sem contato há ${label}` : `há ${label}`}
    </span>
  );
}
