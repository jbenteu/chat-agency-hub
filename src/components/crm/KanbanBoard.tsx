import React, { useMemo } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { usePipeline } from "@/hooks/use-pipeline";
import { useDeals, type Deal } from "@/hooks/use-deals";
import { KanbanColumn } from "./KanbanColumn";
import { DealDetailSheet } from "./DealDetailSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

export function KanbanBoard() {
  const { stages, isLoading: stagesLoading } = usePipeline();
  const { deals, isLoading: dealsLoading, moveDeal } = useDeals();
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    for (const stage of stages) {
      map[stage.id] = [];
    }
    // Also group by stage name for legacy deals without pipeline_stage_id
    for (const deal of deals) {
      if (deal.pipeline_stage_id && map[deal.pipeline_stage_id]) {
        map[deal.pipeline_stage_id].push(deal);
      } else {
        // Match by stage name (fallback for webhook-created deals)
        const matched = stages.find(
          (s) => s.name.toLowerCase() === deal.stage?.toLowerCase() ||
            (deal.stage === "lead" && s.order === 0)
        );
        if (matched && map[matched.id]) {
          map[matched.id].push(deal);
        } else if (stages.length > 0 && map[stages[0].id]) {
          // Default to first stage
          map[stages[0].id].push(deal);
        }
      }
    }
    return map;
  }, [deals, stages]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const targetStage = stages.find((s) => s.id === destination.droppableId);
    if (!targetStage) return;

    const deal = deals.find((d) => d.id === draggableId);
    if (!deal) return;

    const previousStage = deal.pipeline_stage_id
      ? stages.find((s) => s.id === deal.pipeline_stage_id)?.name || deal.stage
      : deal.stage;

    moveDeal.mutate({
      id: draggableId,
      stage: targetStage.name,
      pipeline_stage_id: targetStage.id,
      previousStage,
    });
  };

  if (stagesLoading || dealsLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="min-w-[280px]">
            <Skeleton className="h-10 w-full mb-3" />
            <Skeleton className="h-32 w-full mb-2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-220px)]">
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage[stage.id] || []}
              onDealClick={setSelectedDeal}
            />
          ))}
        </div>
      </DragDropContext>

      <DealDetailSheet
        deal={selectedDeal}
        open={!!selectedDeal}
        onOpenChange={(open) => !open && setSelectedDeal(null)}
      />
    </>
  );
}
