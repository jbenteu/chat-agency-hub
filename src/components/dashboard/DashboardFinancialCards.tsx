import { DollarSign, ShoppingBag, Percent } from "lucide-react";
import { DashboardKPICard } from "./DashboardKPICard";
import { formatBRL } from "@/lib/dashboard-utils";
import type { DashboardFinancials } from "@/hooks/useDashboardData";

interface DashboardFinancialCardsProps {
  data: DashboardFinancials | undefined;
  loading: boolean;
}

export function DashboardFinancialCards({ data, loading }: DashboardFinancialCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <DashboardKPICard
        title="Vendas Realizadas"
        value={data ? formatBRL(data.wonValue) : "—"}
        icon={DollarSign}
        loading={loading}
        description="vendas no período"
        highlight="success"
      />
      <DashboardKPICard
        title="Qtd. de Vendas"
        value={data?.wonCount ?? "—"}
        icon={ShoppingBag}
        loading={loading}
        description="negócios fechados"
      />
      <DashboardKPICard
        title="Taxa de Conversão"
        value={data ? `${data.conversionRate}%` : "—"}
        icon={Percent}
        loading={loading}
        description="vendas / leads no período"
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
