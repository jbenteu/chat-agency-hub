import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { XCircle } from "lucide-react";

const DEFAULT_REASONS = [
  "Preço alto",
  "Comprou da concorrência",
  "Sem resposta",
  "Desistiu",
  "Produto não disponível",
  "Outros",
];

interface LostReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
  stageName?: string;
}

export function LostReasonModal({
  open,
  onOpenChange,
  onConfirm,
  loading,
  stageName = "Perdido",
}: LostReasonModalProps) {
  const [selected, setSelected] = useState<string>("");
  const [custom, setCustom] = useState("");

  const handleConfirm = () => {
    const reason = selected === "Outros" ? custom.trim() || "Outros" : selected;
    if (!reason) return;
    onConfirm(reason);
    setSelected("");
    setCustom("");
  };

  const handleClose = () => {
    setSelected("");
    setCustom("");
    onOpenChange(false);
  };

  const effectiveReason = selected === "Outros" ? custom.trim() : selected;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            <DialogTitle>Motivo da perda</DialogTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Por que este lead está sendo movido para "{stageName}"?
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {DEFAULT_REASONS.map((reason) => (
              <button
                key={reason}
                onClick={() => setSelected(reason)}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm text-left border transition-colors",
                  selected === reason
                    ? "bg-destructive/10 border-destructive text-destructive font-medium"
                    : "bg-muted/30 border-border hover:bg-muted/60 text-foreground"
                )}
              >
                {reason}
              </button>
            ))}
          </div>

          {selected === "Outros" && (
            <div className="space-y-1">
              <Label className="text-xs">Descreva o motivo</Label>
              <Textarea
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Ex: Cliente mudou de ideia após ver o preço final..."
                className="text-sm min-h-[72px] resize-none"
                autoFocus
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!effectiveReason || loading}
            onClick={handleConfirm}
          >
            {loading ? "Salvando..." : "Confirmar perda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
