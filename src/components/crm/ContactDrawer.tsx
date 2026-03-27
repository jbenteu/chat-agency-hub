import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useContacts, type Contact } from "@/hooks/use-contacts";
import { useDeals } from "@/hooks/use-deals";
import { useActivities } from "@/hooks/use-activities";
import { ActivityTimeline } from "./ActivityTimeline";
import { DealDetailSheet } from "./DealDetailSheet";
import { BRAZIL_STATES, BRAZIL_CITIES } from "@/data/brazil-locations";
import { formatPhoneWhatsApp, maskPhoneInput, detectCountryCode, COUNTRY_CODES } from "@/data/country-codes";
import { TagSelector } from "@/components/whatsapp/TagSelector";
import { MessageCircle, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactDrawer({ contact, open, onOpenChange }: Props) {
  if (!contact) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle className="text-lg">{contact.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {contact.phone ? formatPhoneWhatsApp(contact.phone) : "Sem telefone"}
          </p>
        </SheetHeader>
        <Tabs defaultValue="dados" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 w-auto">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="negocios">Negociações</TabsTrigger>
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-full">
              <ContactDataTab contact={contact} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="negocios" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-full">
              <ContactDealsTab contact={contact} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="atividades" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-full">
              <ContactActivitiesTab contact={contact} />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function ContactDataTab({ contact }: { contact: Contact }) {
  const { updateContact } = useContacts();
  const { toast } = useToast();

  const [name, setName] = useState(contact.name);
  const [countryCode, setCountryCode] = useState(() => detectCountryCode(contact.phone));
  const [phoneLocal, setPhoneLocal] = useState(() => {
    if (!contact.phone) return "";
    const digits = contact.phone.replace(/\D/g, "");
    const dialDigits = detectCountryCode(contact.phone).replace(/\D/g, "");
    const local = digits.startsWith(dialDigits) ? digits.slice(dialDigits.length) : digits;
    return maskPhoneInput(local);
  });
  const [email, setEmail] = useState(contact.email || "");
  const [company, setCompany] = useState(contact.company || "");
  const [state, setState] = useState(contact.state || "");
  const [city, setCity] = useState(contact.city || "");
  const [notes, setNotes] = useState(contact.notes || "");
  const [tags, setTags] = useState<string[]>(contact.tags || []);

  const cities = state ? BRAZIL_CITIES[state] || [] : [];

  const buildFullPhone = () => {
    const digits = phoneLocal.replace(/\D/g, "");
    if (!digits) return "";
    const dialDigits = countryCode.replace(/\D/g, "");
    return dialDigits + digits;
  };

  const hasWhatsApp = contact.whatsapp_conversations && contact.whatsapp_conversations.length > 0;

  const handleSave = async () => {
    try {
      await updateContact.mutateAsync({
        id: contact.id,
        name,
        phone: buildFullPhone(),
        email: email || null,
        company: company || null,
        state: state || null,
        city: city || null,
        notes: notes || null,
        tags,
      });
      toast({ title: "Salvo com sucesso ✅" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  };

  return (
    <div className="px-6 py-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Telefone</Label>
          <div className="flex gap-2">
            <Select value={countryCode} onValueChange={setCountryCode}>
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
              value={phoneLocal}
              onChange={(e) => setPhoneLocal(maskPhoneInput(e.target.value))}
              className="flex-1"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">E-mail</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Empresa</Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Origem</Label>
          <Badge
            variant="secondary"
            className={`mt-1 ${hasWhatsApp ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : ""}`}
          >
            {hasWhatsApp && <MessageCircle className="h-3 w-3 mr-1" />}
            {hasWhatsApp ? "WhatsApp" : "Manual"}
          </Badge>
        </div>
        <div>
          <Label className="text-xs">Estado</Label>
          <Select value={state} onValueChange={(v) => { setState(v); setCity(""); }}>
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
          <Select value={city} onValueChange={setCity} disabled={!state}>
            <SelectTrigger><SelectValue placeholder="Cidade" /></SelectTrigger>
            <SelectContent>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs">Tags</Label>
        <TagSelector tags={tags} onChange={setTags} />
      </div>

      <div>
        <Label className="text-xs">Notas</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observações sobre o contato..."
          className="min-h-[80px]"
        />
      </div>

      {contact.phone && (
        <Button variant="outline" size="sm" className="w-full" asChild>
          <a href="/whatsapp">
            <MessageCircle className="h-4 w-4 mr-2 text-green-600" />
            Abrir conversa no Inbox
          </a>
        </Button>
      )}

      <Button onClick={handleSave} className="w-full" disabled={updateContact.isPending}>
        <Save className="h-4 w-4 mr-2" /> Salvar alterações
      </Button>
    </div>
  );
}

function ContactDealsTab({ contact }: { contact: Contact }) {
  const { deals } = useDeals();
  const [selectedDeal, setSelectedDeal] = useState<(typeof deals)[0] | null>(null);

  const contactDeals = deals.filter((d) => d.contact_id === contact.id);
  const statusLabels: Record<string, string> = { open: "Aberto", won: "Ganho", lost: "Perdido" };

  return (
    <div className="px-6 py-4 space-y-3">
      {contactDeals.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma negociação encontrada</p>
      ) : (
        contactDeals.map((deal) => (
          <div
            key={deal.id}
            className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setSelectedDeal(deal)}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium">{deal.title}</p>
              <Badge variant="outline" className="text-[10px]">
                {statusLabels[deal.status] || deal.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-[10px]">{deal.stage}</Badge>
              {deal.value != null && deal.value > 0 && (
                <span className="tabular-nums font-medium text-foreground">
                  {deal.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              )}
            </div>
          </div>
        ))
      )}
      <DealDetailSheet
        deal={selectedDeal}
        open={!!selectedDeal}
        onOpenChange={(o) => !o && setSelectedDeal(null)}
      />
    </div>
  );
}

function ContactActivitiesTab({ contact }: { contact: Contact }) {
  const { activities, isLoading, createActivity } = useActivities({ contact_id: contact.id });
  const [note, setNote] = useState("");
  const [activityType, setActivityType] = useState("nota");

  const handleAdd = async () => {
    if (!note.trim()) return;
    await createActivity.mutateAsync({
      type: activityType,
      content: note,
      contact_id: contact.id,
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
