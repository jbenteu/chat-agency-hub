import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeals } from "@/hooks/use-deals";
import { useContacts, getTenantId } from "@/hooks/use-contacts";
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
  const { contacts } = useContacts();
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [contactId, setContactId] = useState(defaultContactId || "");

  // Sync defaultContactId when it changes
  React.useEffect(() => {
    if (defaultContactId) setContactId(defaultContactId);
  }, [defaultContactId]);

  const defaultStage = stages[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    try {
      const tenantId = await getTenantId();
      const contact = contacts.find((c) => c.id === contactId);
      const title = description.trim() || (contact ? `Venda - ${contact.name}` : "Nova Venda");
      await createDeal.mutateAsync({
        title,
        value: parseFloat(value.replace(",", ".")),
        contact_id: contactId || undefined,
        stage: defaultStage?.name || "Novo Lead",
        pipeline_stage_id: defaultStage?.id,
        tenant_id: tenantId,
      });
      toast({ title: "Venda cadastrada ✅" });
      onOpenChange(false);
      setValue("");
      setDescription("");
      setContactId("");
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
            <Label className="text-xs">Valor (R$) *</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              required
            />
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Anel de ouro 18k..."
            />
          </div>
          <div>
            <Label className="text-xs">Contato</Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.phone ? ` · ${c.phone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={createDeal.isPending}>
            Cadastrar venda
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
