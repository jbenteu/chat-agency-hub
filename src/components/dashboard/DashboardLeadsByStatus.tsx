import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/dashboard-utils";
import type { StageCount } from "@/hooks/useDashboardData";
import { ListFilter } from "lucide-react";

interface DashboardLeadsByStatusProps {
  data: StageCount[] | undefined;
  loading: boolean;
}

export function DashboardLeadsByStatus({ data, loading }: DashboardLeadsByStatusProps) {
  const totalCount = (data || []).reduce((s, d) => s + d.count, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ListFilter className="h-4 w-4 text-muted-foreground" />
          Leads por Estágio
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-px">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 mx-4 mb-2" />
            ))}
          </div>
        ) : !data?.length || totalCount === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-4">Sem negócios cadastrados</p>
        ) : (
          <div className="divide-y divide-border">
            {data
              .filter((s) => s.count > 0)
              .map((stage) => {
                const pct = totalCount > 0 ? Math.round((stage.count / totalCount) * 100) : 0;
                return (
                  <div key={stage.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color || "hsl(var(--primary))" }}
                    />
                    <span className="flex-1 text-sm font-medium truncate">{stage.name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      {stage.value > 0 && (
                        <span className="text-xs text-muted-foreground hidden sm:block">
                          {formatBRL(stage.value)}
                        </span>
                      )}
                      <Badge variant="secondary" className="text-xs tabular-nums px-2 py-0">
                        {stage.count}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground w-7 text-right">{pct}%</span>
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
