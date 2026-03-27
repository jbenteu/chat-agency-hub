import React, { useState } from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import type { PipelineStage } from "@/hooks/use-pipeline";
import type { Deal } from "@/hooks/use-deals";
import { DealCard } from "./DealCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, EyeOff, Check, X } from "lucide-react";

interface KanbanColumnProps {
  stage: PipelineStage;
  deals: Deal[];
  onDealClick: (deal: Deal) => void;
  onRenameStage?: (stageId: string, newName: string) => void;
  onHideStage?: (stageId: string) => void;
}

export function KanbanColumn({ stage, deals, onDealClick, onRenameStage, onHideStage }: KanbanColumnProps) {
  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
  const stageColor = stage.color || "#6366f1";
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(stage.name);

  const isWon  = stage.is_won;
  const isLost = stage.is_closed && !stage.is_won;

  const handleSave = () => {
    if (editName.trim() && editName.trim() !== stage.name) {
      onRenameStage?.(stage.id, editName.trim());
    }
    setEditing(false);
  };

  return (
    <div className="flex flex-col min-w-[220px] flex-1">
      {/* Column header */}
      <div
        className="px-2 py-1.5 border-b-2 flex-shrink-0 group/header"
        style={{ borderColor: stageColor }}
      >
        <div className="flex items-center justify-between gap-1">
          {editing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-6 text-xs px-1.5 flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") { setEditing(false); setEditName(stage.name); }
                }}
              />
              <button onClick={handleSave} className="p-0.5 hover:bg-muted rounded">
                <Check className="h-3 w-3 text-green-600" />
              </button>
              <button onClick={() => { setEditing(false); setEditName(stage.name); }} className="p-0.5 hover:bg-muted rounded">
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <>
              <h3 className="text-xs font-bold uppercase tracking-wide truncate" style={{ color: stageColor }}>
                {stage.name}
              </h3>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {deals.length} · {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-0.5 rounded opacity-0 group-hover/header:opacity-100 hover:bg-muted transition-all">
                      <MoreHorizontal className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => { setEditName(stage.name); setEditing(true); }}>
                      <Pencil className="h-3 w-3 mr-2" /> Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onHideStage?.(stage.id)}>
                      <EyeOff className="h-3 w-3 mr-2" /> Ocultar coluna
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
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
