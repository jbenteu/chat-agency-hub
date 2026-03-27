import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  MessageCircle, MoreVertical, Edit, ArrowRight, CheckCircle2,
  XCircle, Trash2, Package, CalendarDays, AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatPhoneWhatsApp } from "@/data/country-codes";
import type { Deal } from "@/hooks/use-deals";
import { useDeals } from "@/hooks/use-deals";
import { usePipeline } from "@/hooks/use-pipeline";
import { useToast } from "@/hooks/use-toast";

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  urgente: { label: "Urgente", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  alta:    { label: "Alta",    className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400" },
  media:   { label: "Média",   className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400" },
  baixa:   { label: "Baixa",   className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
};

interface DealCardProps {
  deal: Deal;
  onClick: () => void;
  stageColor?: string | null;
}

export function DealCard({ deal, onClick, stageColor }: DealCardProps) {
  const { moveDeal, deleteDeal, updateDeal } = useDeals();
  const { stages } = usePipeline();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLossDialog, setShowLossDialog] = useState(false);
  const [lossReason, setLossReason] = useState("");

  const contact = deal.contact;
  const initials = (contact?.name || deal.title || "?")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const itemsCount = deal.deal_items?.length || 0;
  const priority = deal.priority || "media";
  const priorityCfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.media;

  const isOverdue = deal.expected_close_date
    ? new Date(deal.expected_close_date + "T23:59:59") < new Date()
    : false;

  const handleMoveNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIdx = stages.findIndex((s) => s.name === deal.stage);
    if (currentIdx < 0 || currentIdx >= stages.length - 1) return;
    const next = stages[currentIdx + 1];
    moveDeal.mutate({
      id: deal.id,
      stage: next.name,
      pipeline_stage_id: next.id,
      previousStage: deal.stage,
    });
  };

  const handleMarkWon = (e: React.MouseEvent) => {
    e.stopPropagation();
    const wonStage = stages.find((s) => s.name.toLowerCase().includes("ganho"));
    if (wonStage) {
      moveDeal.mutate({ id: deal.id, stage: wonStage.name, pipeline_stage_id: wonStage.id, previousStage: deal.stage });
    } else {
      updateDeal.mutate({ id: deal.id, status: "won", closed_at: new Date().toISOString() } as never);
    }
    toast({ title: "Deal marcado como ganho ✅" });
  };

  const handleMarkLost = () => {
    const lostStage = stages.find((s) => s.name.toLowerCase().includes("perdido"));
    if (lostStage) {
      moveDeal.mutate({ id: deal.id, stage: lostStage.name, pipeline_stage_id: lostStage.id, previousStage: deal.stage });
    }
    updateDeal.mutate({ id: deal.id, status: "lost", closed_at: new Date().toISOString(), loss_reason: lossReason } as never);
    setShowLossDialog(false);
    setLossReason("");
    toast({ title: "Deal marcado como perdido ❌" });
  };

  const handleDelete = () => {
    deleteDeal.mutate(deal.id);
    setShowDeleteDialog(false);
    toast({ title: "Deal excluído" });
  };

  return (
    <>
      <Card
        className="cursor-pointer hover:shadow-md active:scale-[0.98] transition-all border-l-2"
        style={{ borderLeftColor: stageColor || "hsl(var(--border))" }}
        onClick={onClick}
      >
        <CardContent className="p-3 space-y-2">
          {/* Header: avatar + name + menu */}
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7 flex-shrink-0">
              <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{contact?.name || "Sem contato"}</p>
              <p className="text-[11px] text-muted-foreground truncate">{deal.title}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="p-1 rounded hover:bg-muted transition-colors">
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(); }}>
                  <Edit className="h-3.5 w-3.5 mr-2" /> Editar negociação
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMoveNext}>
                  <ArrowRight className="h-3.5 w-3.5 mr-2" /> Mover para próximo estágio
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMarkWon}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-green-600" /> Marcar como Ganho
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShowLossDialog(true); }}>
                  <XCircle className="h-3.5 w-3.5 mr-2 text-red-600" /> Marcar como Perdido
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(true); }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Value + items count */}
          <div className="flex items-center gap-3 text-xs">
            {deal.value != null && deal.value > 0 && (
              <span className="font-semibold tabular-nums text-sm">
                {deal.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            )}
            {itemsCount > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Package className="h-3 w-3" /> {itemsCount} {itemsCount === 1 ? "produto" : "produtos"}
              </span>
            )}
          </div>

          {/* Date + priority */}
          {(deal.expected_close_date || priority !== "media") && (
            <div className="flex items-center gap-2 text-[11px]">
              {deal.expected_close_date && (
                <span className={`flex items-center gap-1 ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {isOverdue && <AlertTriangle className="h-3 w-3" />}
                  <CalendarDays className="h-3 w-3" />
                  {new Date(deal.expected_close_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </span>
              )}
              {priority !== "media" && (
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${priorityCfg.className}`}>
                  {priorityCfg.label}
                </Badge>
              )}
            </div>
          )}

          {/* WhatsApp link */}
          {contact?.phone && (
            <button
              onClick={(e) => { e.stopPropagation(); window.open("/whatsapp", "_self"); }}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-green-600 transition-colors w-full"
            >
              <MessageCircle className="h-3 w-3" />
              <span className="truncate">{formatPhoneWhatsApp(contact.phone).slice(0, 18)}</span>
            </button>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
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
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Loss reason dialog */}
      <Dialog open={showLossDialog} onOpenChange={setShowLossDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo da perda</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Descreva o motivo da perda..."
            value={lossReason}
            onChange={(e) => setLossReason(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowLossDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleMarkLost}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
