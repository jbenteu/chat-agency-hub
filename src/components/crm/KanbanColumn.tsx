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

  const isWon  = stage.is_won;
  const isLost = stage.is_closed && !stage.is_won;

  return (
    <div className="flex flex-col min-w-[220px] flex-1">
      {/* Column header */}
      <div className="px-2 py-1.5 border-b-2 flex-shrink-0" style={{ borderColor: stageColor }}>
        <div className="flex items-center justify-between gap-1">
          <h3 className="text-xs font-bold uppercase tracking-wide truncate" style={{ color: stageColor }}>
            {stage.name}
          </h3>
          <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
            {deals.length} leads: {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        </div>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={stage.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-1 space-y-0.5 min-h-[80px] overflow-y-auto transition-colors ${
              snapshot.isDraggingOver
                ? "bg-accent/50"
                : isWon
                ? "bg-green-50/40 dark:bg-green-950/10"
                : isLost
                ? "bg-red-50/40 dark:bg-red-950/10"
                : "bg-transparent"
            }`}
          >
            {deals.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex items-center justify-center h-12 text-[10px] text-muted-foreground">
                Arraste um card para cá
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
