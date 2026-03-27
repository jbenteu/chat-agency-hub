import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardToolbar, type PeriodKey } from "@/components/dashboard/DashboardToolbar";
import { DashboardKPICards } from "@/components/dashboard/DashboardKPICards";
import { DashboardFinancialCards } from "@/components/dashboard/DashboardFinancialCards";
import { DashboardFunnel } from "@/components/dashboard/DashboardFunnel";
import { DashboardLeadSources } from "@/components/dashboard/DashboardLeadSources";
import { DashboardLeadsByStatus } from "@/components/dashboard/DashboardLeadsByStatus";
import { DashboardRecentActivity } from "@/components/dashboard/DashboardRecentActivity";
import { DashboardTasks } from "@/components/dashboard/DashboardTasks";
import { DashboardLeadEvolution } from "@/components/dashboard/DashboardLeadEvolution";
import { useDashboardData, type DateRange } from "@/hooks/useDashboardData";
import { getPeriodDates } from "@/lib/dashboard-utils";

const Dashboard = () => {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [range, setRange] = useState<DateRange>(() => getPeriodDates("30d"));

  const handlePeriodChange = (key: PeriodKey, newRange: DateRange) => {
    setPeriod(key);
    setRange(newRange);
  };

  const { kpis, financials, funnel, sources, evolution, activities, tasks } =
    useDashboardData(range);

  return (
    <AppLayout>
      <div className="space-y-6">
        <DashboardToolbar period={period} onPeriodChange={handlePeriodChange} />

        {/* Engagement KPIs */}
        <DashboardKPICards
          data={kpis.data}
          loading={kpis.isLoading}
        />

        {/* Financial KPIs */}
        <DashboardFinancialCards
          data={financials.data}
          loading={financials.isLoading}
        />

        {/* Lead Evolution full-width */}
        <DashboardLeadEvolution
          data={evolution.data}
          loading={evolution.isLoading}
        />

        {/* Funnel + Sources side by side */}
        <div className="grid gap-4 lg:grid-cols-2">
          <DashboardFunnel
            data={funnel.data}
            loading={funnel.isLoading}
          />
          <DashboardLeadSources
            data={sources.data}
            loading={sources.isLoading}
          />
        </div>

        {/* Leads by stage + Tasks */}
        <div className="grid gap-4 lg:grid-cols-2">
          <DashboardLeadsByStatus
            data={funnel.data}
            loading={funnel.isLoading}
          />
          <DashboardTasks
            data={tasks.data}
            loading={tasks.isLoading}
          />
        </div>

        {/* Recent activity full-width */}
        <DashboardRecentActivity
          data={activities.data}
          loading={activities.isLoading}
        />
      </div>
    </AppLayout>
  );
};

export default Dashboard;
