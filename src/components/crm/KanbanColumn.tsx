import React from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import type { PipelineStage } from "@/hooks/use-pipeline";
import type { Deal } from "@/hooks/use-deals";
import { DealCard } from "./DealCard";
import { ScrollArea } from "@/components/ui/scroll-area";

interface KanbanColumnProps {
  stage: PipelineStage;
  deals: Deal[];
  onDealClick: (deal: Deal) => void;
}

export function KanbanColumn({ stage, deals, onDealClick }: KanbanColumnProps) {
  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] flex-shrink-0">
      {/* Column header */}
      <div
        className="rounded-t-lg px-3 py-2.5 mb-0"
        style={{ backgroundColor: `${stage.color || "#6366f1"}18`, borderLeft: `3px solid ${stage.color || "#6366f1"}` }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold truncate" style={{ color: stage.color || undefined }}>
            {stage.name}
          </h3>
          <span className="flex items-center justify-center h-5 min-w-[20px] rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
            {deals.length}
          </span>
        </div>
        {totalValue > 0 && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        )}
      </div>

      {/* Droppable area */}
      <Droppable droppableId={stage.id}>
        {(provided, snapshot) => {
          const isWon = stage.name.toLowerCase().includes("ganho") || stage.name.toLowerCase().includes("won");
          const isLost = stage.name.toLowerCase().includes("perdido") || stage.name.toLowerCase().includes("lost");
          return (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 rounded-b-lg p-1.5 space-y-2 min-h-[120px] transition-colors ${
              snapshot.isDraggingOver
                ? "bg-accent/50"
                : isWon
                ? "bg-green-50/60 dark:bg-green-950/20"
                : isLost
                ? "bg-red-50/60 dark:bg-red-950/20"
                : "bg-muted/30"
            }`}
          >
            {deals.map((deal, index) => (
              <Draggable key={deal.id} draggableId={deal.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    style={provided.draggableProps.style}
                    className={`transition-shadow ${snapshot.isDragging ? "shadow-lg rotate-1" : ""}`}
                  >
                    <DealCard deal={deal} onClick={() => onDealClick(deal)} stageColor={stage.color} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
          );
        }}
      </Droppable>
    </div>
  );
}
