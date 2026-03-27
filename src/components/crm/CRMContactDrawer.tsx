import React from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  MessageCircle, MapPin, Mail, Instagram, X, Briefcase,
} from "lucide-react";
import { formatPhoneWhatsApp } from "@/data/country-codes";
import type { Contact } from "@/hooks/use-contacts";
import type { Deal } from "@/hooks/use-deals";
import { useDeals } from "@/hooks/use-deals";
import { usePipeline } from "@/hooks/use-pipeline";
import { CRMPinnedNote } from "./CRMPinnedNote";
import { CRMStatusPipeline } from "./CRMStatusPipeline";
import { CRMContactDrawerData } from "./CRMContactDrawerData";
import { CRMTaskList } from "./CRMTaskList";
import { CRMTimeline } from "./CRMTimeline";
import { CRMScoreBadge } from "./CRMScoreBadge";
import { toast } from "sonner";

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

function ContactDealsTab({ contact }: { contact: Contact }) {
  const { deals } = useDeals();
  const { stages } = usePipeline();
  const contactDeals = deals.filter((d) => d.contact_id === contact.id);

  if (contactDeals.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Nenhuma negociação vinculada
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {contactDeals.map((deal) => {
        const stage = stages.find((s) => s.id === deal.pipeline_stage_id || s.name === deal.stage);
        return (
          <div key={deal.id} className="rounded-lg border border-border p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{deal.title}</p>
              {deal.value != null && deal.value > 0 && (
                <span className="text-sm font-semibold tabular-nums text-green-700 dark:text-green-400 flex-shrink-0">
                  {deal.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {stage && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-4"
                  style={{ backgroundColor: `${stage.color}20`, color: stage.color || undefined }}
                >
                  {stage.name}
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground">
                {deal.created_at ? new Date(deal.created_at).toLocaleDateString("pt-BR") : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface CRMContactDrawerProps {
  contact: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDeal?: Deal | null;
}

export function CRMContactDrawer({ contact, open, onOpenChange, initialDeal }: CRMContactDrawerProps) {
  const { moveDeal } = useDeals();
  const { stages } = usePipeline();

  if (!contact) return null;

  const initials = contact.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const avatarColor = getAvatarColor(contact.name);

  const currentStageId = initialDeal?.pipeline_stage_id || null;
  const currentStageName = initialDeal?.stage || null;

  const handleStageClick = (stageId: string, stageName: string) => {
    if (!initialDeal) return;
    const targetStage = stages.find((s) => s.id === stageId);
    if (!targetStage) return;

    if (targetStage.is_closed && !targetStage.is_won) {
      if (!confirm("Tem certeza que deseja mover para 'Perdido'?")) return;
    }

    moveDeal.mutate(
      { id: initialDeal.id, stage: stageName, pipeline_stage_id: stageId, previousStage: initialDeal.stage },
      {
        onSuccess: () => toast.success(`Movido para ${stageName}`),
        onError: () => toast.error("Erro ao mover negociação"),
      }
    );
  };

  const locationParts = [contact.city, contact.state].filter(Boolean).join(", ");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[480px] p-0 flex flex-col gap-0" side="right">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarFallback className="text-sm font-semibold text-white" style={{ backgroundColor: avatarColor }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight truncate">{contact.name}</h2>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  {contact.phone && (
                    <span className="text-sm text-muted-foreground">{formatPhoneWhatsApp(contact.phone)}</span>
                  )}
                  <CRMScoreBadge score={contact.score || 0} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {contact.phone && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950"
                  onClick={() => window.open("/whatsapp", "_self")}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {contact.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />{contact.email}
              </span>
            )}
            {contact.instagram && (
              <span className="flex items-center gap-1">
                <Instagram className="h-3 w-3" />{contact.instagram}
              </span>
            )}
            {locationParts && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />{locationParts}
              </span>
            )}
            {contact.company && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3 w-3" />{contact.company}
              </span>
            )}
          </div>

          {/* Mini pipeline stepper */}
          {initialDeal && (
            <CRMStatusPipeline
              currentStageId={currentStageId}
              currentStageName={currentStageName}
              onStageClick={handleStageClick}
            />
          )}

          {/* Pinned note */}
          <CRMPinnedNote contactId={contact.id} pinnedNote={contact.pinned_note} />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="dados" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-2 w-auto self-start">
            <TabsTrigger value="dados" className="text-xs">Dados</TabsTrigger>
            <TabsTrigger value="negocios" className="text-xs">Negociações</TabsTrigger>
            <TabsTrigger value="tarefas" className="text-xs">Tarefas</TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="flex-1 overflow-hidden mt-2">
            <ScrollArea className="h-full">
              <CRMContactDrawerData contact={contact} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="negocios" className="flex-1 overflow-hidden mt-2">
            <ScrollArea className="h-full">
              <ContactDealsTab contact={contact} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="tarefas" className="flex-1 overflow-hidden mt-2">
            <ScrollArea className="h-full">
              <CRMTaskList contactId={contact.id} tenantId={contact.tenant_id} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="timeline" className="flex-1 overflow-hidden mt-2">
            <CRMTimeline contactId={contact.id} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
