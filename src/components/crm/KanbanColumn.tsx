import React from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import type { PipelineStage } from "@/hooks/use-pipeline";
import type { Deal } from "@/hooks/use-deals";
import { DealCard } from "./DealCard";

interface KanbanColumnProps {
  stage: PipelineStage;
  deals: Deal[];
  onDealClick: (deal: Deal) => void;
}

export function KanbanColumn({ stage, deals, onDealClick }: KanbanColumnProps) {
  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
  const stageColor = stage.color || "#6366f1";

  const bgStyle = {
    backgroundColor: `${stageColor}12`,
    borderTop: `3px solid ${stageColor}`,
  };

  const isWon  = stage.is_won;
  const isLost = stage.is_closed && !stage.is_won;

  return (
    <div className="flex flex-col w-[300px] flex-shrink-0">
      {/* Sticky header */}
      <div
        className="rounded-t-lg px-3 py-2 sticky top-0 z-10"
        style={bgStyle}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="h-2 w-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: stageColor }}
            />
            <h3 className="text-sm font-semibold truncate" style={{ color: stageColor }}>
              {stage.name}
            </h3>
          </div>
          <span className="flex items-center justify-center h-5 min-w-[20px] rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground flex-shrink-0">
            {deals.length}
          </span>
        </div>
        {totalValue > 0 && (
          <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
            {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        )}
      </div>

      {/* Droppable area */}
      <Droppable droppableId={stage.id}>
        {(provided, snapshot) => (
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
            {deals.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex items-center justify-center h-16 text-[11px] text-muted-foreground text-center px-2">
                Sem leads. Arraste um card para cá.
              </div>
            )}
            {deals.map((deal, index) => (
              <Draggable key={deal.id} draggableId={deal.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    style={provided.draggableProps.style}
                    className={`transition-shadow ${snapshot.isDragging ? "shadow-lg rotate-1 opacity-95" : ""}`}
                  >
                    <DealCard
                      deal={deal}
                      onClick={() => onDealClick(deal)}
                      stageColor={stageColor}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
