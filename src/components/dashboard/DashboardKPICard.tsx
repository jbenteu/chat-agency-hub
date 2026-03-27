import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface DashboardKPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  loading?: boolean;
  trend?: number | null;
  description?: string;
  highlight?: "default" | "success" | "warning" | "danger";
}

export function DashboardKPICard({
  title,
  value,
  icon: Icon,
  loading,
  trend,
  description,
  highlight = "default",
}: DashboardKPICardProps) {
  const iconBg = {
    default: "bg-primary/10 text-primary",
    success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  }[highlight];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
        <div className={cn("p-1.5 rounded-md", iconBg)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <>
            <Skeleton className="h-8 w-20 mb-1" />
            <Skeleton className="h-3 w-28" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold tabular-nums">{value}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {trend !== null && trend !== undefined && (
                <span
                  className={cn(
                    "text-xs font-medium",
                    trend > 0 ? "text-green-600" : trend < 0 ? "text-red-500" : "text-muted-foreground"
                  )}
                >
                  {trend > 0 ? "+" : ""}{trend}%
                </span>
              )}
              {description && (
                <span className="text-xs text-muted-foreground">{description}</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
