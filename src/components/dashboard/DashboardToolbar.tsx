import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPeriodDates } from "@/lib/dashboard-utils";
import type { DateRange } from "@/hooks/useDashboardData";

export type PeriodKey = "hoje" | "ontem" | "7d" | "30d";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
];

interface DashboardToolbarProps {
  period: PeriodKey;
  onPeriodChange: (key: PeriodKey, range: DateRange) => void;
  rightSlot?: React.ReactNode;
}

export function DashboardToolbar({ period, onPeriodChange, rightSlot }: DashboardToolbarProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do seu CRM</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg">
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant="ghost"
              onClick={() => onPeriodChange(p.key, getPeriodDates(p.key))}
              className={cn(
                "h-7 px-3 text-xs font-medium rounded-md transition-all",
                period === p.key && "bg-background shadow-sm text-foreground"
              )}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {rightSlot}
      </div>
    </div>
  );
}
