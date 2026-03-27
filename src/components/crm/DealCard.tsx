import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageCircle, Clock, AlertCircle, ArrowUp, Minus, ChevronDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatPhoneWhatsApp } from "@/data/country-codes";
import type { Deal } from "@/hooks/use-deals";

const PRIORITY_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  urgente: { label: "Urgente", color: "text-red-600", icon: <AlertCircle className="h-3 w-3" /> },
  alta:    { label: "Alta",    color: "text-orange-500", icon: <ArrowUp className="h-3 w-3" /> },
  media:   { label: "Média",   color: "text-muted-foreground", icon: <Minus className="h-3 w-3" /> },
  baixa:   { label: "Baixa",   color: "text-blue-400", icon: <ChevronDown className="h-3 w-3" /> },
};

interface DealCardProps {
  deal: Deal;
  onClick: () => void;
  stageColor?: string | null;
}

export function DealCard({ deal, onClick, stageColor }: DealCardProps) {
  const contact = deal.contact;
  const initials = (contact?.name || deal.title || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const timeAgo = deal.created_at
    ? formatDistanceToNow(new Date(deal.created_at), { addSuffix: false, locale: ptBR })
    : null;

  const priority = deal.priority || "media";
  const priorityCfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.media;

  return (
    <Card
      className="cursor-pointer hover:shadow-md active:scale-[0.98] transition-all border-l-2"
      style={{ borderLeftColor: stageColor || "hsl(var(--border))" }}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        {/* Contact name + avatar + priority */}
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
          {priority !== "media" && (
            <span className={`flex items-center gap-0.5 text-[11px] flex-shrink-0 ${priorityCfg.color}`} title={`Prioridade: ${priorityCfg.label}`}>
              {priorityCfg.icon}
            </span>
          )}
        </div>

        {/* Value */}
        {deal.value != null && deal.value > 0 && (
          <p className="text-sm font-semibold tabular-nums">
            {deal.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        )}

        {/* Expected close date */}
        {deal.expected_close_date && (
          <p className="text-[11px] text-muted-foreground">
            Fecha: {new Date(deal.expected_close_date + "T00:00:00").toLocaleDateString("pt-BR")}
          </p>
        )}

        {/* Tags */}
        {contact?.tags && contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {contact.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                {tag}
              </Badge>
            ))}
            {contact.tags.length > 3 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                +{contact.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Bottom row: phone + time */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          {contact?.phone ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(`/whatsapp`, "_self");
              }}
              className="flex items-center gap-1 hover:text-green-600 transition-colors"
            >
              <MessageCircle className="h-3 w-3" />
              <span>{formatPhoneWhatsApp(contact.phone).slice(0, 18)}</span>
            </button>
          ) : (
            <span />
          )}
          {timeAgo && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {timeAgo}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
