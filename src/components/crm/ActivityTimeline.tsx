import React from "react";
import { type Activity } from "@/hooks/use-activities";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  StickyNote,
  Phone,
  Mail,
  MessageCircle,
  Users,
  ArrowRightLeft,
} from "lucide-react";

const TYPE_ICONS: Record<string, React.ElementType> = {
  nota: StickyNote,
  ligacao: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  reuniao: Users,
  deal_update: ArrowRightLeft,
};

const TYPE_LABELS: Record<string, string> = {
  nota: "Nota",
  ligacao: "Ligação",
  email: "E-mail",
  whatsapp: "WhatsApp",
  reuniao: "Reunião",
  deal_update: "Atualização",
};

interface Props {
  activities: Activity[];
  isLoading: boolean;
}

export function ActivityTimeline({ activities, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nenhuma atividade registrada
      </p>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-4 top-4 bottom-4 w-px bg-border" />

      {activities.map((activity) => {
        const Icon = TYPE_ICONS[activity.type] || StickyNote;
        const label = TYPE_LABELS[activity.type] || activity.type;
        const timeAgo = activity.created_at
          ? formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: ptBR })
          : "";

        return (
          <div key={activity.id} className="relative flex gap-3 py-3">
            <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-muted border border-border">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{label}</span>
                <span className="text-[11px] text-muted-foreground">{timeAgo}</span>
              </div>
              {activity.content && (
                <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap">{activity.content}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
