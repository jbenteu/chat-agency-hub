import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeals } from "@/hooks/use-deals";
import { useContacts, getTenantId } from "@/hooks/use-contacts";
import { usePipeline } from "@/hooks/use-pipeline";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewDealDialog({ open, onOpenChange }: Props) {
  const { createDeal } = useDeals();
  const { contacts } = useContacts();
  const { stages } = usePipeline();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [stageId, setStageId] = useState("");

  const defaultStage = stages[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const tenantId = await getTenantId();
      const selectedStage = stages.find((s) => s.id === stageId) || defaultStage;
      await createDeal.mutateAsync({
        title,
        contact_id: contactId || undefined,
        stage: selectedStage?.name || "Novo Lead",
        pipeline_stage_id: selectedStage?.id,
        tenant_id: tenantId,
      });
      toast({ title: "Negociação criada ✅" });
      onOpenChange(false);
      setTitle("");
      setContactId("");
      setStageId("");
    } catch {
      toast({ title: "Erro ao criar negociação", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Negociação</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs">Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
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
          <div>
            <Label className="text-xs">Estágio</Label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger><SelectValue placeholder={defaultStage?.name || "Selecione..."} /></SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={createDeal.isPending}>
            Criar negociação
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
