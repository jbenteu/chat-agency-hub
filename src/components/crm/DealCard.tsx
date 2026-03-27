import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MoreVertical, Edit, ArrowRight, CheckCircle2, XCircle, Trash2, Clock } from "lucide-react";
import type { Deal } from "@/hooks/use-deals";
import { useDeals } from "@/hooks/use-deals";
import { usePipeline } from "@/hooks/use-pipeline";
import { useTasks } from "@/hooks/use-tasks";
import { toast } from "sonner";
import { CRMNoContactBadge } from "./CRMNoContactBadge";
import { format } from "date-fns";

interface DealCardProps {
  deal: Deal;
  onClick: () => void;
  stageColor?: string | null;
}

export function DealCard({ deal, onClick, stageColor }: DealCardProps) {
  const { moveDeal, deleteDeal } = useDeals();
  const { stages } = usePipeline();
  const { tasks } = useTasks({ deal_id: deal.id, completed: false });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLossDialog, setShowLossDialog] = useState(false);
  const [lossReason, setLossReason] = useState("");

  const contact = deal.contact;
  const displayName = contact?.name || deal.title || "?";
  const lastContactAt = (contact as unknown as { last_contact_at?: string | null })?.last_contact_at ?? null;

  const nextTask = tasks.length > 0 ? tasks[0] : null;
  const isTaskOverdue = nextTask ? new Date(nextTask.due_date) < new Date() : false;

  const createdDate = deal.created_at ? format(new Date(deal.created_at), "dd/MM/yyyy") : "";

  // Use stage color for left border and subtle background tint
  const cardBg = stageColor ? `${stageColor}08` : undefined;

  const handleMarkWon = (e: React.MouseEvent) => {
    e.stopPropagation();
    const wonStage = stages.find((s) => s.is_won);
    if (wonStage) moveDeal.mutate({ id: deal.id, stage: wonStage.name, pipeline_stage_id: wonStage.id, previousStage: deal.stage });
    toast.success("Deal marcado como ganho");
  };

  const handleMoveNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIdx = stages.findIndex((s) => s.name === deal.stage || s.id === deal.pipeline_stage_id);
    if (currentIdx < 0 || currentIdx >= stages.length - 1) return;
    const next = stages[currentIdx + 1];
    moveDeal.mutate({ id: deal.id, stage: next.name, pipeline_stage_id: next.id, previousStage: deal.stage });
  };

  const handleMarkLost = () => {
    const lostStage = stages.find((s) => s.is_closed && !s.is_won);
    if (lostStage) moveDeal.mutate({ id: deal.id, stage: lostStage.name, pipeline_stage_id: lostStage.id, previousStage: deal.stage });
    setShowLossDialog(false);
    toast.error("Deal marcado como perdido");
  };

  return (
    <>
      <div
        className="border-b border-border/50 cursor-pointer hover:brightness-95 dark:hover:brightness-110 transition-all group px-2 py-1.5"
        style={{
          backgroundColor: cardBg,
          borderLeft: `3px solid ${stageColor || "hsl(var(--border))"}`,
        }}
        onClick={onClick}
      >
        {/* Row 1: Name + Date */}
        <div className="flex items-start justify-between gap-1">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate leading-tight">{displayName}</p>
            <p className="text-[10px] truncate" style={{ color: stageColor || "hsl(var(--primary))" }}>{deal.title}</p>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <span className="text-[10px] text-muted-foreground tabular-nums">{createdDate}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all">
                  <MoreVertical className="h-3 w-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(); }}>
                  <Edit className="h-3.5 w-3.5 mr-2" /> Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMoveNext}>
                  <ArrowRight className="h-3.5 w-3.5 mr-2" /> Próximo estágio
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMarkWon}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-green-600" /> Marcar como Ganho
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShowLossDialog(true); }}>
                  <XCircle className="h-3.5 w-3.5 mr-2 text-red-600" /> Marcar como Perdido
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(true); }}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Row 2: Task indicator + value */}
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-[10px]" style={{ color: stageColor || "hsl(var(--muted-foreground))" }}>●</span>
          <div className="flex-1 min-w-0">
            {nextTask ? (
              <span className={`flex items-center gap-0.5 text-[10px] truncate ${isTaskOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                <Clock className="h-2.5 w-2.5 flex-shrink-0" />
                {nextTask.title}
              </span>
            ) : (
              <CRMNoContactBadge lastContactAt={lastContactAt} />
            )}
          </div>
          {deal.value != null && deal.value > 0 && (
            <span className="text-[10px] font-semibold tabular-nums text-foreground flex-shrink-0">
              {deal.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          )}
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir venda</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deal.title}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteDeal.mutate(deal.id); setShowDeleteDialog(false); }} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showLossDialog} onOpenChange={setShowLossDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Motivo da perda</DialogTitle></DialogHeader>
          <Input placeholder="Descreva o motivo da perda..." value={lossReason} onChange={(e) => setLossReason(e.target.value)} />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowLossDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleMarkLost}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
