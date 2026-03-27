import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useDeals } from "@/hooks/use-deals";
import { getTenantId } from "@/hooks/use-contacts";
import type { PipelineStage } from "@/hooks/use-pipeline";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages?: PipelineStage[];
  defaultContactId?: string;
}

export function NewDealDialog({ open, onOpenChange, stages = [], defaultContactId }: Props) {
  const { createDeal } = useDeals();
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");

  const defaultStage = stages[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    try {
      const tenantId = await getTenantId();
      const title = description.trim() || "Nova Venda";
      await createDeal.mutateAsync({
        title,
        value: parseFloat(value.replace(",", ".")),
        contact_id: defaultContactId || undefined,
        stage: defaultStage?.name || "Novo Lead",
        pipeline_stage_id: defaultStage?.id,
        tenant_id: tenantId,
      });
      toast({ title: "Venda cadastrada ✅" });
      onOpenChange(false);
      setValue("");
      setDescription("");
    } catch {
      toast({ title: "Erro ao cadastrar venda", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Venda</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs">Descrição do produto/serviço</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Anel de ouro 18k, Colar com diamante..."
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs">Valor (R$) *</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={createDeal.isPending}>
            Cadastrar venda
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
