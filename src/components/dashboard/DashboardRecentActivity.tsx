import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Phone, Mail, FileText, MessageCircle, CheckSquare,
  UserPlus, DollarSign, Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ActivityItem } from "@/hooks/useDashboardData";

const TYPE_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  note: FileText,
  whatsapp: MessageCircle,
  task: CheckSquare,
  contact_created: UserPlus,
  deal_created: DollarSign,
  deal_moved: DollarSign,
};

const TYPE_LABELS: Record<string, string> = {
  call: "Ligação",
  email: "E-mail",
  note: "Nota",
  whatsapp: "WhatsApp",
  task: "Tarefa",
  contact_created: "Novo contato",
  deal_created: "Novo negócio",
  deal_moved: "Negócio movido",
};

interface DashboardRecentActivityProps {
  data: ActivityItem[] | undefined;
  loading: boolean;
}

export function DashboardRecentActivity({ data, loading }: DashboardRecentActivityProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Atividade Recente
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-px p-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full mb-2" />)}
          </div>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-4">
            Nenhuma atividade registrada
          </p>
        ) : (
          <div className="divide-y divide-border max-h-[340px] overflow-y-auto">
            {data.map((a) => {
              const Icon = TYPE_ICONS[a.type] || Activity;
              const label = TYPE_LABELS[a.type] || a.type;
              return (
                <div key={a.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30">
                  <div className="p-1 rounded bg-muted mt-0.5 shrink-0">
                    <Icon className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{label}</p>
                    {a.content && (
                      <p className="text-[11px] text-muted-foreground truncate">{a.content}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                    {a.created_at
                      ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })
                      : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
