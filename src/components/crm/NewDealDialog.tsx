import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useDeals } from "@/hooks/use-deals";
import { getTenantId, useContacts } from "@/hooks/use-contacts";
import type { PipelineStage } from "@/hooks/use-pipeline";
import { useToast } from "@/hooks/use-toast";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, User } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [contactOpen, setContactOpen] = useState(false);

  const defaultStage = stages[0];

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === contactId),
    [contacts, contactId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    try {
      const tenantId = await getTenantId();
      const title = description.trim() || "Nova Venda";
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
            <Label className="text-xs">Cliente (opcional)</Label>
            <Popover open={contactOpen} onOpenChange={setContactOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={contactOpen}
                  className="w-full justify-between font-normal"
                  type="button"
                >
                  {selectedContact ? (
                    <span className="flex items-center gap-2 truncate">
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {selectedContact.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Selecionar cliente...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar cliente..." />
                  <CommandList>
                    <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                    <CommandGroup>
                      {contactId && (
                        <CommandItem
                          value="__clear__"
                          onSelect={() => {
                            setContactId("");
                            setContactOpen(false);
                          }}
                          className="text-muted-foreground"
                        >
                          Nenhum (sem vínculo)
                        </CommandItem>
                      )}
                      {contacts.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={() => {
                            setContactId(c.id);
                            setContactOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              contactId === c.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="truncate">{c.name}</span>
                          {c.phone && (
                            <span className="ml-auto text-xs text-muted-foreground">{c.phone}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
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
