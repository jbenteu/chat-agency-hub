import { Users, MessageCircle, Inbox, AlertCircle } from "lucide-react";
import { DashboardKPICard } from "./DashboardKPICard";
import type { DashboardKPIs } from "@/hooks/useDashboardData";
import type { DashboardWidgetConfig } from "@/hooks/useDashboardConfig";

interface DashboardKPICardsProps {
  data: DashboardKPIs | undefined;
  loading: boolean;
  config?: DashboardWidgetConfig;
}

export function DashboardKPICards({ data, loading, config }: DashboardKPICardsProps) {
  const show = {
    leads: !config || config.kpiLeads,
    conversations: !config || config.kpiConversations,
    messages: !config || config.kpiMessages,
    unanswered: !config || config.kpiUnanswered,
  };

  const visibleCount = Object.values(show).filter(Boolean).length;
  const colClass =
    visibleCount === 1
      ? "grid gap-4 sm:grid-cols-1 lg:grid-cols-1 max-w-xs"
      : visibleCount === 2
      ? "grid gap-4 sm:grid-cols-2"
      : visibleCount === 3
      ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className={colClass}>
      {show.leads && (
        <DashboardKPICard
          title="Leads Novos"
          value={data?.newLeads ?? "—"}
          icon={Users}
          loading={loading}
          description="no período"
        />
      )}
      {show.conversations && (
        <DashboardKPICard
          title="Conversas Ativas"
          value={data?.activeConversations ?? "—"}
          icon={MessageCircle}
          loading={loading}
          description="em aberto"
          highlight="default"
        />
      )}
      {show.messages && (
        <DashboardKPICard
          title="Msgs Recebidas"
          value={data?.inboundMessages ?? "—"}
          icon={Inbox}
          loading={loading}
          description="no período"
        />
      )}
      {show.unanswered && (
        <DashboardKPICard
          title="Sem Resposta"
          value={data?.unanswered ?? "—"}
          icon={AlertCircle}
          loading={loading}
          description="última msg do cliente, 30 dias"
          highlight={data && data.unanswered > 0 ? "danger" : "default"}
        />
      )}
    </div>
  );
}
