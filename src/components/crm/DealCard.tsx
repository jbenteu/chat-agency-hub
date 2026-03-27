import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { MessageCircle, MoreVertical, Edit, ArrowRight, CheckCircle2, XCircle, Trash2, Clock } from "lucide-react";
import type { Deal } from "@/hooks/use-deals";
import { useDeals } from "@/hooks/use-deals";
import { usePipeline } from "@/hooks/use-pipeline";
import { useTasks } from "@/hooks/use-tasks";
import { toast } from "sonner";
import { CRMScoreBadge } from "./CRMScoreBadge";
import { CRMNoContactBadge } from "./CRMNoContactBadge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

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
  const initials = displayName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const avatarColor = getAvatarColor(displayName);

  const score = (contact as unknown as { score?: number })?.score ?? 0;
  const lastContactAt = (contact as unknown as { last_contact_at?: string | null })?.last_contact_at ?? null;

  // Next pending task
  const nextTask = tasks.length > 0 ? tasks[0] : null;
  const isTaskOverdue = nextTask ? new Date(nextTask.due_date) < new Date() : false;

  const tags = contact?.tags || [];
  const visibleTags = tags.slice(0, 2);
  const extraTags = tags.length - 2;

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
        className="bg-card border border-border rounded-lg cursor-pointer hover:shadow-md transition-all duration-200 group"
        style={{ borderLeftWidth: 3, borderLeftColor: stageColor || "hsl(var(--border))" }}
        onClick={onClick}
      >
        <div className="p-2.5 space-y-1.5">
          {/* Header: avatar + name + score + menu */}
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7 flex-shrink-0">
              <AvatarFallback className="text-[10px] font-semibold text-white" style={{ backgroundColor: avatarColor }}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate leading-tight">{displayName}</p>
              {contact?.phone && (
                <p className="text-[10px] text-muted-foreground truncate">{contact.phone}</p>
              )}
            </div>
            <CRMScoreBadge score={score} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all">
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(); }}>
                  <Edit className="h-3.5 w-3.5 mr-2" /> Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMoveNext}>
                  <ArrowRight className="h-3.5 w-3.5 mr-2" /> Próximo estágio
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open("/whatsapp", "_self")}>
                  <MessageCircle className="h-3.5 w-3.5 mr-2 text-green-600" /> Abrir WhatsApp
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

          {/* Deal title + value */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground truncate flex-1">{deal.title}</p>
            {deal.value != null && deal.value > 0 && (
              <span className="text-sm font-semibold tabular-nums text-foreground flex-shrink-0">
                {deal.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            )}
          </div>

          {/* Tags */}
          {visibleTags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {visibleTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal">
                  {tag}
                </Badge>
              ))}
              {extraTags > 0 && (
                <span className="text-[9px] text-muted-foreground">+{extraTags}</span>
              )}
            </div>
          )}

          {/* Footer: task or no-contact indicator */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex-1 min-w-0">
              {nextTask ? (
                <span className={`flex items-center gap-1 text-[10px] truncate ${isTaskOverdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                  <Clock className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">
                    {isTaskOverdue ? "Atrasado: " : ""}{nextTask.title}
                    {" · "}{formatDistanceToNow(new Date(nextTask.due_date), { locale: ptBR, addSuffix: true })}
                  </span>
                </span>
              ) : (
                <CRMNoContactBadge lastContactAt={lastContactAt} />
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir negociação</AlertDialogTitle>
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
