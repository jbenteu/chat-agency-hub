import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_COLORS, SOURCE_LABELS } from "@/lib/dashboard-utils";
import type { SourceCount } from "@/hooks/useDashboardData";
import { Globe } from "lucide-react";

interface DashboardLeadSourcesProps {
  data: SourceCount[] | undefined;
  loading: boolean;
}

export function DashboardLeadSources({ data, loading }: DashboardLeadSourcesProps) {
  const total = (data || []).reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          Leads por Origem
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[180px] w-full" />
        ) : !data?.length || total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="h-[160px] w-[160px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={72}
                    strokeWidth={2}
                  >
                    {data.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      value,
                      SOURCE_LABELS[name] || name,
                    ]}
                    contentStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5 min-w-0">
              {data.map((d, i) => {
                const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                return (
                  <div key={d.name} className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {SOURCE_LABELS[d.name] || d.name}
                    </span>
                    <span className="text-xs font-medium tabular-nums">{d.value}</span>
                    <span className="text-[10px] text-muted-foreground w-7 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
