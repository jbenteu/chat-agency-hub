import React from "react";
import { cn } from "@/lib/utils";

interface CRMScoreBadgeProps {
  score: number;
  className?: string;
}

export function CRMScoreBadge({ score, className }: CRMScoreBadgeProps) {
  const colorClass =
    score >= 70
      ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
      : score >= 40
      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
      : "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[10px] font-semibold tabular-nums",
        colorClass,
        className
      )}
    >
      {score}
    </span>
  );
}
