import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardToolbar, type PeriodKey } from "@/components/dashboard/DashboardToolbar";
import { DashboardKPICards } from "@/components/dashboard/DashboardKPICards";
import { DashboardFinancialCards } from "@/components/dashboard/DashboardFinancialCards";
import { DashboardFunnel } from "@/components/dashboard/DashboardFunnel";
import { DashboardLeadsByStatus } from "@/components/dashboard/DashboardLeadsByStatus";
import { DashboardRecentActivity } from "@/components/dashboard/DashboardRecentActivity";
import { DashboardTasks } from "@/components/dashboard/DashboardTasks";
import { DashboardLeadEvolution } from "@/components/dashboard/DashboardLeadEvolution";
import { useDashboardData, type DateRange } from "@/hooks/useDashboardData";
import { useDashboardConfig, WIDGET_LABELS } from "@/hooks/useDashboardConfig";
import { getPeriodDates } from "@/lib/dashboard-utils";
import { Button } from "@/components/ui/button";
import { Settings2, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const Dashboard = () => {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [range, setRange] = useState<DateRange>(() => getPeriodDates("30d"));
  const { config, toggle, resetToDefault } = useDashboardConfig();

  const handlePeriodChange = (key: PeriodKey, newRange: DateRange) => {
    setPeriod(key);
    setRange(newRange);
  };

  const { kpis, financials, funnel, evolution, activities, tasks } = useDashboardData(range);

  const showAnyKpi =
    config.kpiLeads || config.kpiConversations || config.kpiMessages || config.kpiUnanswered;

  const configButton = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-7 px-3 text-xs">
          <Settings2 className="h-3.5 w-3.5" />
          Configurar
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Widgets visíveis</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={resetToDefault}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Restaurar
            </Button>
          </div>
          <div className="space-y-2.5">
            {(Object.keys(WIDGET_LABELS) as Array<keyof typeof WIDGET_LABELS>).map((key) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <Label htmlFor={`widget-${key}`} className="text-xs font-normal cursor-pointer">
                  {WIDGET_LABELS[key]}
                </Label>
                <Switch
                  id={`widget-${key}`}
                  checked={config[key]}
                  onCheckedChange={() => toggle(key)}
                />
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <DashboardToolbar period={period} onPeriodChange={handlePeriodChange} rightSlot={configButton} />

        {showAnyKpi && (
          <DashboardKPICards data={kpis.data} loading={kpis.isLoading} config={config} />
        )}

        {config.financialCards && (
          <DashboardFinancialCards data={financials.data} loading={financials.isLoading} />
        )}

        {config.evolution && (
          <DashboardLeadEvolution data={evolution.data} loading={evolution.isLoading} />
        )}

        {config.funnel && (
          <DashboardFunnel data={funnel.data} loading={funnel.isLoading} />
        )}

        {(config.leadsByStatus || config.tasks) && (
          <div className="grid gap-4 lg:grid-cols-2">
            {config.leadsByStatus && (
              <DashboardLeadsByStatus data={funnel.data} loading={funnel.isLoading} />
            )}
            {config.tasks && (
              <DashboardTasks data={tasks.data} loading={tasks.isLoading} />
            )}
          </div>
        )}

        {config.recentActivity && (
          <DashboardRecentActivity data={activities.data} loading={activities.isLoading} />
        )}
      </div>
    </AppLayout>
  );
};

export default Dashboard;
