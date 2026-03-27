import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatCompact } from "@/lib/dashboard-utils";
import type { StageCount } from "@/hooks/useDashboardData";
import { GitBranch } from "lucide-react";

interface DashboardFunnelProps {
  data: StageCount[] | undefined;
  loading: boolean;
}

export function DashboardFunnel({ data, loading }: DashboardFunnelProps) {
  const maxCount = Math.max(...(data || []).map((s) => s.count), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          Funil de Vendas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2.5">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sem estágios configurados</p>
        ) : (
          <div className="space-y-2">
            {data.map((stage) => {
              const pct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
              const color = stage.color || "hsl(var(--primary))";
              return (
                <div key={stage.id} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 text-xs text-muted-foreground truncate text-right">
                    {stage.name}
                  </div>
                  <div className="flex-1 relative h-7 bg-muted/40 rounded overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
                    />
                    <div className="absolute inset-0 flex items-center px-2 gap-2">
                      <span className="text-xs font-semibold text-foreground z-10">
                        {stage.count}
                      </span>
                      {stage.value > 0 && (
                        <span className="text-[10px] text-muted-foreground z-10">
                          {formatBRL(stage.value)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-12 shrink-0 text-xs text-muted-foreground text-right">
                    {formatCompact(stage.count)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
