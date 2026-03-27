import { DollarSign, TrendingUp, BarChart2, Percent } from "lucide-react";
import { DashboardKPICard } from "./DashboardKPICard";
import { formatBRL } from "@/lib/dashboard-utils";
import type { DashboardFinancials } from "@/hooks/useDashboardData";

interface DashboardFinancialCardsProps {
  data: DashboardFinancials | undefined;
  loading: boolean;
}

export function DashboardFinancialCards({ data, loading }: DashboardFinancialCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <DashboardKPICard
        title="Ganhos (período)"
        value={data ? formatBRL(data.wonValue) : "—"}
        icon={DollarSign}
        loading={loading}
        description="negócios fechados"
        highlight="success"
      />
      <DashboardKPICard
        title="Deals Ativos"
        value={data ? formatBRL(data.openValue) : "—"}
        icon={TrendingUp}
        loading={loading}
        description="em aberto"
      />
      <DashboardKPICard
        title="Pipeline Total"
        value={data ? formatBRL(data.pipelineTotal) : "—"}
        icon={BarChart2}
        loading={loading}
        description="todos os deals"
      />
      <DashboardKPICard
        title="Taxa Conversão"
        value={data ? `${data.conversionRate}%` : "—"}
        icon={Percent}
        loading={loading}
        description="ganhos / fechados"
        highlight={
          data && data.conversionRate >= 50
            ? "success"
            : data && data.conversionRate >= 25
            ? "warning"
            : "danger"
        }
      />
    </div>
  );
}
