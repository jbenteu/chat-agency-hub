import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DayCount } from "@/hooks/useDashboardData";
import { TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DashboardLeadEvolutionProps {
  data: DayCount[] | undefined;
  loading: boolean;
}

export function DashboardLeadEvolution({ data, loading }: DashboardLeadEvolutionProps) {
  const total = (data || []).reduce((s, d) => s + d.leads, 0);
  const showDayLabel = (data?.length ?? 0) <= 14;

  const formatted = (data || []).map((d) => ({
    ...d,
    label: showDayLabel
      ? format(parseISO(d.date), "dd/MM", { locale: ptBR })
      : format(parseISO(d.date), "dd/MM"),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Evolução de Leads
          </CardTitle>
          {!loading && total > 0 && (
            <span className="text-xs text-muted-foreground">{total} no total</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <Skeleton className="h-[180px] w-full" />
        ) : !data?.length || total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Sem dados no período</p>
        ) : (
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formatted} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  interval={showDayLabel ? 0 : Math.ceil(formatted.length / 8) - 1}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  formatter={(value: number) => [value, "Leads"]}
                  labelFormatter={(label) => `Dia: ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="leads"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#leadGrad)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
