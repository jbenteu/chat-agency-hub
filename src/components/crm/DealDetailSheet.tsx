import React, { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDeals, type Deal } from "@/hooks/use-deals";
import { DealItemsForm } from "./DealItemsForm";
import { useContacts } from "@/hooks/use-contacts";
import { useActivities } from "@/hooks/use-activities";
import { usePipeline } from "@/hooks/use-pipeline";
import { ActivityTimeline } from "./ActivityTimeline";
import { MessageCircle, ExternalLink, Save, Gem } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneWhatsApp } from "@/data/country-codes";

interface Props {
  deal: Deal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DealDetailSheet({ deal, open, onOpenChange }: Props) {
  if (!deal) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle className="text-lg">{deal.contact?.name || deal.title}</SheetTitle>
          <p className="text-sm text-muted-foreground">{deal.title}</p>
        </SheetHeader>
        <Tabs defaultValue="dados" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 w-auto">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-full">
              <DealDataTab deal={deal} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="atividades" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-full">
              <ActivitiesTab deal={deal} />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function DealDataTab({ deal }: { deal: Deal }) {
  const { updateDeal } = useDeals();
  const { contacts } = useContacts();
  const { stages } = usePipeline();
  const { toast } = useToast();

  const [contactId, setContactId] = useState(deal.contact_id || "");
  const [dealTitle, setDealTitle] = useState(deal.title);
  const [dealStage, setDealStage] = useState(() => {
    const matched = stages.find((s) => s.name === deal.stage);
    return matched?.id || stages[0]?.id || "";
  });
  const [dealStatus, setDealStatus] = useState(deal.status);
  const [dealPriority, setDealPriority] = useState(deal.priority || "media");
  const [dealExpectedClose, setDealExpectedClose] = useState(deal.expected_close_date || "");
  const [dealLossReason, setDealLossReason] = useState(deal.loss_reason || "");
  const [notes, setNotes] = useState("");

  // Sync stage select when stages load
  useEffect(() => {
    if (stages.length > 0 && !dealStage) {
      const matched = stages.find((s) => s.name === deal.stage);
      setDealStage(matched?.id || stages[0]?.id || "");
    }
  }, [stages, deal.stage, dealStage]);

  const totalItemsValue = (deal.deal_items || []).reduce(
    (sum, item) => sum + item.quantity * item.unit_price, 0
  );

  const handleSave = async () => {
    try {
      const matchedStage = stages.find((s) => s.id === dealStage);
      await updateDeal.mutateAsync({
        id: deal.id,
        title: dealTitle,
        value: totalItemsValue,
        stage: matchedStage?.name || deal.stage,
        pipeline_stage_id: matchedStage?.id || null,
        status: dealStatus,
        priority: dealPriority,
        expected_close_date: dealExpectedClose || null,
        loss_reason: dealLossReason || null,
        contact_id: contactId || null,
      });
      toast({ title: "Salvo com sucesso ✅" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  };

  return (
    <div className="px-6 py-4 space-y-5">
      {/* Deal fields */}
      <div>
        <h4 className="text-sm font-medium mb-3">Negociação</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
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
          <div className="col-span-2">
            <Label className="text-xs">Título</Label>
            <Input value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Estágio</Label>
            <Select value={dealStage} onValueChange={setDealStage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={dealStatus} onValueChange={setDealStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Aberto</SelectItem>
                <SelectItem value="won">Ganho</SelectItem>
                <SelectItem value="lost">Perdido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Prioridade</Label>
            <Select value={dealPriority} onValueChange={setDealPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Previsão de fechamento</Label>
            <Input
              type="date"
              value={dealExpectedClose}
              onChange={(e) => setDealExpectedClose(e.target.value)}
            />
          </div>
          {dealStatus === "lost" && (
            <div className="col-span-2">
              <Label className="text-xs">Motivo da perda</Label>
              <Input
                placeholder="Descreva o motivo..."
                value={dealLossReason}
                onChange={(e) => setDealLossReason(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Products section */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Gem className="h-4 w-4" /> Produtos / Itens da Venda
        </h4>
        <DealItemsForm
          dealId={deal.id}
          tenantId={deal.tenant_id}
          items={deal.deal_items || []}
        />
        {totalItemsValue > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Este valor será salvo automaticamente no deal ao clicar em "Salvar".
          </p>
        )}
      </div>

      <Separator />

      {/* WhatsApp section */}
      {deal.contact?.phone && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">WhatsApp</h4>
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-medium">{deal.contact.name}</p>
              <p className="text-xs text-muted-foreground">{formatPhoneWhatsApp(deal.contact.phone)}</p>
            </div>
          </div>
          <Button asChild variant="outline" className="w-full" size="sm">
            <a href="/whatsapp">
              <ExternalLink className="h-4 w-4 mr-2" /> Abrir conversa no Inbox
            </a>
          </Button>
        </div>
      )}

      <Button onClick={handleSave} className="w-full" disabled={updateDeal.isPending}>
        <Save className="h-4 w-4 mr-2" /> Salvar alterações
      </Button>
    </div>
  );
}

function ActivitiesTab({ deal }: { deal: Deal }) {
  const { activities, isLoading, createActivity } = useActivities({
    deal_id: deal.id,
    contact_id: deal.contact_id || undefined,
  });
  const [note, setNote] = useState("");
  const [activityType, setActivityType] = useState("nota");

  const handleAdd = async () => {
    if (!note.trim()) return;
    await createActivity.mutateAsync({
      type: activityType,
      content: note,
      deal_id: deal.id,
      contact_id: deal.contact_id || undefined,
    });
    setNote("");
  };

  return (
    <div className="px-6 py-4 space-y-4">
      <div className="space-y-2">
        <div className="flex gap-2">
          <Select value={activityType} onValueChange={setActivityType}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nota">📝 Nota</SelectItem>
              <SelectItem value="ligacao">📞 Ligação</SelectItem>
              <SelectItem value="reuniao">🤝 Reunião</SelectItem>
              <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea
          placeholder="Adicionar atividade..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[80px]"
        />
        <Button size="sm" onClick={handleAdd} disabled={!note.trim() || createActivity.isPending}>
          Adicionar
        </Button>
      </div>
      <Separator />
      <ActivityTimeline activities={activities} isLoading={isLoading} />
    </div>
  );
}
