import React, { useState } from "react";
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
import { useContacts } from "@/hooks/use-contacts";
import { useActivities } from "@/hooks/use-activities";
import { usePipeline } from "@/hooks/use-pipeline";
import { BRAZIL_STATES, BRAZIL_CITIES } from "@/data/brazil-locations";
import { formatPhoneWhatsApp, maskPhoneInput, detectCountryCode, COUNTRY_CODES } from "@/data/country-codes";
import { TagSelector } from "@/components/whatsapp/TagSelector";
import { ActivityTimeline } from "./ActivityTimeline";
import { MessageCircle, ExternalLink, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const { updateContact } = useContacts();
  const { stages } = usePipeline();
  const { toast } = useToast();
  const contact = deal.contact;

  const [contactName, setContactName] = useState(contact?.name || "");
  const [contactCountryCode, setContactCountryCode] = useState(() => detectCountryCode(contact?.phone));
  const [contactPhoneLocal, setContactPhoneLocal] = useState(() => {
    if (!contact?.phone) return "";
    const digits = contact.phone.replace(/\D/g, "");
    const dialDigits = detectCountryCode(contact.phone).replace(/\D/g, "");
    const local = digits.startsWith(dialDigits) ? digits.slice(dialDigits.length) : digits;
    return maskPhoneInput(local);
  });
  const [contactEmail, setContactEmail] = useState(contact?.email || "");
  const [contactCompany, setContactCompany] = useState(contact?.company || "");
  const [contactState, setContactState] = useState(contact?.state || "");
  const [contactCity, setContactCity] = useState(contact?.city || "");
  const [contactTags, setContactTags] = useState<string[]>(contact?.tags || []);
  const [dealTitle, setDealTitle] = useState(deal.title);
  const [dealValue, setDealValue] = useState(deal.value?.toString() || "0");
  const [dealStage, setDealStage] = useState(deal.pipeline_stage_id || deal.stage);
  const [dealStatus, setDealStatus] = useState(deal.status);

  const cities = contactState ? BRAZIL_CITIES[contactState] || [] : [];

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContactPhoneLocal(maskPhoneInput(e.target.value));
  };

  const buildFullPhone = () => {
    const digits = contactPhoneLocal.replace(/\D/g, "");
    if (!digits) return "";
    const dialDigits = contactCountryCode.replace(/\D/g, "");
    return dialDigits + digits;
  };

  const handleSave = async () => {
    try {
      const matchedStage = stages.find((s) => s.id === dealStage);
      await updateDeal.mutateAsync({
        id: deal.id,
        title: dealTitle,
        value: parseFloat(dealValue) || 0,
        stage: matchedStage?.name || dealStage,
        pipeline_stage_id: matchedStage?.id || null,
        status: dealStatus,
      });

      if (contact) {
        await updateContact.mutateAsync({
          id: contact.id,
          name: contactName,
          phone: buildFullPhone(),
          email: contactEmail,
          company: contactCompany,
          state: contactState,
          city: contactCity,
          tags: contactTags,
        });
      }
      toast({ title: "Salvo com sucesso" });
    } catch (err) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  };

  return (
    <div className="px-6 py-4 space-y-5">
      {/* Contact section */}
      <div>
        <h4 className="text-sm font-medium mb-3">Contato</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Nome</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Telefone</Label>
            <div className="flex gap-2">
              <Select value={contactCountryCode} onValueChange={setContactCountryCode}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_CODES.map((c) => (
                    <SelectItem key={c.code} value={c.dial}>
                      {c.flag} {c.dial}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="(99) 9 9999-9999"
                value={contactPhoneLocal}
                onChange={handlePhoneChange}
                className="flex-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">E-mail</Label>
            <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Empresa</Label>
            <Input value={contactCompany} onChange={(e) => setContactCompany(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Origem</Label>
            <Badge variant="secondary">{contact?.origin || "manual"}</Badge>
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={contactState} onValueChange={(v) => { setContactState(v); setContactCity(""); }}>
              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                {BRAZIL_STATES.map((s) => (
                  <SelectItem key={s.uf} value={s.uf}>{s.uf} - {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Cidade</Label>
            <Select value={contactCity} onValueChange={setContactCity} disabled={!contactState}>
              <SelectTrigger><SelectValue placeholder="Cidade" /></SelectTrigger>
              <SelectContent>
                {cities.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3">
          <Label className="text-xs">Tags</Label>
          <TagSelector tags={contactTags} onChange={setContactTags} />
        </div>
      </div>

      <Separator />

      {/* Deal section */}
      <div>
        <h4 className="text-sm font-medium mb-3">Negociação</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Título</Label>
            <Input value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Valor (R$)</Label>
            <Input type="number" value={dealValue} onChange={(e) => setDealValue(e.target.value)} />
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
            <Label className="text-xs">Criado em</Label>
            <p className="text-sm text-muted-foreground mt-1">
              {deal.created_at
                ? new Date(deal.created_at).toLocaleDateString("pt-BR")
                : "—"}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* WhatsApp section (moved from tab) */}
      <WhatsAppSection deal={deal} />

      <Button onClick={handleSave} className="w-full" disabled={updateDeal.isPending}>
        <Save className="h-4 w-4 mr-2" />
        Salvar alterações
      </Button>
    </div>
  );
}

function WhatsAppSection({ deal }: { deal: Deal }) {
  const contact = deal.contact;

  if (!contact?.phone) {
    return (
      <div className="py-4 text-center">
        <MessageCircle className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Contato sem telefone vinculado</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">WhatsApp</h4>
      <div className="flex items-center gap-3">
        <MessageCircle className="h-5 w-5 text-green-600" />
        <div>
          <p className="text-sm font-medium">{contact.name}</p>
          <p className="text-xs text-muted-foreground">{formatPhoneWhatsApp(contact.phone)}</p>
        </div>
      </div>
      <Button asChild variant="outline" className="w-full" size="sm">
        <a href="/whatsapp">
          <ExternalLink className="h-4 w-4 mr-2" />
          Abrir conversa no Inbox
        </a>
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

  const handleAddNote = async () => {
    if (!note.trim()) return;
    await createActivity.mutateAsync({
      type: "nota",
      content: note,
      deal_id: deal.id,
      contact_id: deal.contact_id || undefined,
    });
    setNote("");
  };

  return (
    <div className="px-6 py-4 space-y-4">
      <div className="space-y-2">
        <Textarea
          placeholder="Adicionar uma nota..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[80px]"
        />
        <Button size="sm" onClick={handleAddNote} disabled={!note.trim() || createActivity.isPending}>
          Adicionar nota
        </Button>
      </div>
      <Separator />
      <ActivityTimeline activities={activities} isLoading={isLoading} />
    </div>
  );
}
