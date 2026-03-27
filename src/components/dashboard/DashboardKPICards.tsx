import { Users, MessageCircle, Inbox, AlertCircle } from "lucide-react";
import { DashboardKPICard } from "./DashboardKPICard";
import type { DashboardKPIs } from "@/hooks/useDashboardData";

interface DashboardKPICardsProps {
  data: DashboardKPIs | undefined;
  loading: boolean;
}

export function DashboardKPICards({ data, loading }: DashboardKPICardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <DashboardKPICard
        title="Leads Novos"
        value={data?.newLeads ?? "—"}
        icon={Users}
        loading={loading}
        description="no período"
      />
      <DashboardKPICard
        title="Conversas Ativas"
        value={data?.activeConversations ?? "—"}
        icon={MessageCircle}
        loading={loading}
        description="em aberto"
        highlight="default"
      />
      <DashboardKPICard
        title="Msgs Recebidas"
        value={data?.inboundMessages ?? "—"}
        icon={Inbox}
        loading={loading}
        description="no período"
      />
      <DashboardKPICard
        title="Sem Resposta"
        value={data?.unanswered ?? "—"}
        icon={AlertCircle}
        loading={loading}
        description="pendentes"
        highlight={data && data.unanswered > 0 ? "danger" : "default"}
      />
    </div>
  );
}
