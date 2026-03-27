import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StickyNote, Phone, Mail, MessageCircle, Users, ArrowRightLeft,
  CheckSquare, Send, Info, Plus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useActivities, type Activity } from "@/hooks/use-activities";
import { toast } from "sonner";

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  nota:         { icon: StickyNote,      color: "text-yellow-600", label: "Nota" },
  ligacao:      { icon: Phone,           color: "text-blue-600",   label: "Ligação" },
  email:        { icon: Mail,            color: "text-purple-600", label: "E-mail" },
  whatsapp:     { icon: MessageCircle,   color: "text-green-600",  label: "WhatsApp" },
  reuniao:      { icon: Users,           color: "text-indigo-600", label: "Reunião" },
  deal_update:  { icon: ArrowRightLeft,  color: "text-orange-600", label: "Atualização" },
  task_done:    { icon: CheckSquare,     color: "text-green-600",  label: "Tarefa concluída" },
  created:      { icon: Info,            color: "text-muted-foreground", label: "Lead criado" },
};

function ActivityItem({ activity }: { activity: Activity }) {
  const cfg = TYPE_CONFIG[activity.type] || TYPE_CONFIG.nota;
  const Icon = cfg.icon;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0`}>
          <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
        </div>
        <div className="w-px flex-1 bg-border mt-1" />
      </div>
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium">{cfg.label}</span>
          {activity.created_at && (
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(activity.created_at), { locale: ptBR, addSuffix: true })}
            </span>
          )}
        </div>
        {activity.content && (
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {activity.content}
          </p>
        )}
        {activity.metadata && typeof activity.metadata === "object" && (activity.metadata as Record<string, unknown>).from_stage && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {String((activity.metadata as Record<string, unknown>).from_stage)} → {String((activity.metadata as Record<string, unknown>).to_stage)}
          </p>
        )}
      </div>
    </div>
  );
}

interface CRMTimelineProps {
  contactId: string;
}

export function CRMTimeline({ contactId }: CRMTimelineProps) {
  const { activities, isLoading, createActivity } = useActivities({ contact_id: contactId });
  const [note, setNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const handleAddNote = () => {
    if (!note.trim()) return;
    createActivity.mutate(
      { type: "nota", content: note.trim(), contact_id: contactId },
      {
        onSuccess: () => {
          toast.success("Nota adicionada");
          setNote("");
          setAddingNote(false);
        },
        onError: () => toast.error("Erro ao adicionar nota"),
      }
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Add note box */}
      <div className="p-4 border-b border-border">
        {addingNote ? (
          <div className="space-y-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Escreva uma nota sobre este contato..."
              className="text-sm min-h-[72px] resize-none"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setNote(""); setAddingNote(false); }} className="h-7 text-xs">
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleAddNote}
                disabled={!note.trim() || createActivity.isPending}
                className="h-7 text-xs gap-1"
              >
                <Send className="h-3 w-3" /> Adicionar nota
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddingNote(true)}
            className="w-full h-8 text-xs gap-1.5 border-dashed"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar nota
          </Button>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-7 w-7 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && activities.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Info className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma atividade registrada</p>
            <p className="text-xs text-muted-foreground mt-1">Adicione uma nota para começar a timeline</p>
          </div>
        )}

        {!isLoading && activities.length > 0 && (
          <div>
            {activities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
