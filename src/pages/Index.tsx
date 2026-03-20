import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Briefcase, TrendingUp, DollarSign, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { usePipeline } from "@/hooks/use-pipeline";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function useDashboardMetrics() {
  return useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: async () => {
      const [contactsRes, dealsRes, activitiesRes] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }),
        supabase.from("deals").select("*"),
        supabase.from("activities").select("*").order("created_at", { ascending: false }).limit(10),
      ]);

      const totalContacts = contactsRes.count || 0;
      const deals = dealsRes.data || [];
      const activities = activitiesRes.data || [];

      const openDeals = deals.filter((d) => d.status === "open");
      const wonDeals = deals.filter((d) => d.status === "won");
      const lostDeals = deals.filter((d) => d.status === "lost");
      const closedTotal = wonDeals.length + lostDeals.length;
      const conversionRate = closedTotal > 0 ? Math.round((wonDeals.length / closedTotal) * 100) : 0;
      const pipelineValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);

      // Deals by stage
      const stageCount: Record<string, number> = {};
      for (const d of deals) {
        stageCount[d.stage] = (stageCount[d.stage] || 0) + 1;
      }

      // Deals by origin
      const originCount: Record<string, number> = {};
      // We'll approximate from contacts
      const { data: contacts } = await supabase.from("contacts").select("origin");
      for (const c of contacts || []) {
        const origin = (c as { origin: string | null }).origin || "manual";
        originCount[origin] = (originCount[origin] || 0) + 1;
      }

      return {
        totalContacts,
        openDeals: openDeals.length,
        pipelineValue,
        conversionRate,
        stageData: Object.entries(stageCount).map(([name, value]) => ({ name, value })),
        originData: Object.entries(originCount).map(([name, value]) => ({ name, value })),
        activities,
      };
    },
    refetchInterval: 30000,
  });
}

const ORIGIN_COLORS = ["hsl(var(--primary))", "#22C55E", "#F59E0B", "#8B5CF6", "#EF4444"];

const Dashboard = () => {
  const { data, isLoading } = useDashboardMetrics();
  const { stages } = usePipeline();

  const stats = [
    { title: "Total de Contatos", value: data?.totalContacts ?? 0, icon: Users, fmt: (v: number) => v.toString() },
    { title: "Deals Abertos", value: data?.openDeals ?? 0, icon: Briefcase, fmt: (v: number) => v.toString() },
    {
      title: "Valor do Pipeline",
      value: data?.pipelineValue ?? 0,
      icon: DollarSign,
      fmt: (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
    },
    { title: "Taxa de Conversão", value: data?.conversionRate ?? 0, icon: TrendingUp, fmt: (v: number) => `${v}%` },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral do seu CRM</p>
        </div>

        {/* Metrics cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold tabular-nums">{stat.fmt(stat.value)}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Funnel / Bar chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Funil de vendas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : !data?.stageData?.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sem dados</p>
              ) : (
                <ChartContainer config={{}} className="h-[220px] w-full">
                  <BarChart data={data.stageData} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="value"
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Origin pie chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leads por origem</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : !data?.originData?.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sem dados</p>
              ) : (
                <div className="flex items-center gap-6">
                  <ChartContainer config={{}} className="h-[200px] w-[200px]">
                    <PieChart>
                      <Pie
                        data={data.originData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        strokeWidth={2}
                      >
                        {data.originData.map((_, i) => (
                          <Cell key={i} fill={ORIGIN_COLORS[i % ORIGIN_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ChartContainer>
                  <div className="space-y-2">
                    {data.originData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2 text-sm">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: ORIGIN_COLORS[i % ORIGIN_COLORS.length] }}
                        />
                        <span className="capitalize">{d.name}</span>
                        <span className="text-muted-foreground">({d.value})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Atividade recente</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : !data?.activities?.length ? (
              <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
            ) : (
              <div className="space-y-3">
                {data.activities.map((a: any) => (
                  <div key={a.id} className="flex items-start gap-3">
                    <Activity className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{a.content || a.type}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {a.created_at
                          ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })
                          : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
