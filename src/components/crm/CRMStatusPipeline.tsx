import React from "react";
import { Check } from "lucide-react";
import { usePipeline } from "@/hooks/use-pipeline";
import { cn } from "@/lib/utils";

interface CRMStatusPipelineProps {
  currentStageId: string | null;
  currentStageName?: string | null;
  onStageClick?: (stageId: string, stageName: string) => void;
  readOnly?: boolean;
}

export function CRMStatusPipeline({
  currentStageId,
  currentStageName,
  onStageClick,
  readOnly = false,
}: CRMStatusPipelineProps) {
  const { stages } = usePipeline();

  const openStages = stages.filter((s) => !s.is_closed);
  const closedStages = stages.filter((s) => s.is_closed);

  const currentStage =
    stages.find((s) => s.id === currentStageId) ||
    stages.find((s) => s.name === currentStageName);
  const currentOrder = currentStage?.order ?? -1;

  return (
    <div className="space-y-1">
      {/* Open stages as stepper */}
      <div className="flex items-center gap-0 overflow-x-auto pb-1">
        {openStages.map((stage, idx) => {
          const isActive = stage.id === currentStage?.id;
          const isPast = currentStage && !currentStage.is_closed && stage.order < currentOrder;
          const isLast = idx === openStages.length - 1;
          const color = stage.color || "#6366f1";

          return (
            <div key={stage.id} className="flex items-center">
              <button
                onClick={() => !readOnly && onStageClick?.(stage.id, stage.name)}
                disabled={readOnly}
                title={stage.name}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1 rounded-md transition-colors text-center min-w-[60px]",
                  !readOnly && "hover:bg-muted cursor-pointer",
                  readOnly && "cursor-default"
                )}
              >
                <div
                  className={cn(
                    "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                    isActive
                      ? "border-current"
                      : isPast
                      ? "border-current"
                      : "border-border bg-background"
                  )}
                  style={
                    isActive || isPast
                      ? { borderColor: color, backgroundColor: isActive ? color : `${color}30`, color }
                      : {}
                  }
                >
                  {isPast && <Check className="h-2.5 w-2.5 text-white" style={{ color }} />}
                  {isActive && <div className="h-2 w-2 rounded-full bg-white" />}
                </div>
                <span
                  className={cn(
                    "text-[9px] font-medium leading-tight max-w-[55px] truncate",
                    isActive ? "font-semibold" : "text-muted-foreground"
                  )}
                  style={isActive ? { color } : {}}
                >
                  {stage.name}
                </span>
              </button>
              {!isLast && (
                <div
                  className="h-px w-3 flex-shrink-0 transition-colors"
                  style={{
                    backgroundColor:
                      isPast || isActive ? (stage.color || "#6366f1") : "hsl(var(--border))",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Closed stages as separate pills */}
      {currentStage?.is_closed && (
        <div className="flex gap-2 mt-1">
          {closedStages.map((stage) => {
            const isActive = stage.id === currentStage.id;
            return (
              <button
                key={stage.id}
                onClick={() => !readOnly && onStageClick?.(stage.id, stage.name)}
                disabled={readOnly}
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                  isActive
                    ? "text-white border-transparent"
                    : "text-muted-foreground border-border bg-background hover:bg-muted",
                  !readOnly && !isActive && "cursor-pointer"
                )}
                style={isActive ? { backgroundColor: stage.color || "#6366f1", borderColor: stage.color || "#6366f1" } : {}}
              >
                {stage.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
