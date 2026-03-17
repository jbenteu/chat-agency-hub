import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageCircle, TrendingUp, BarChart3 } from "lucide-react";

const stats = [
  { title: "Contatos", value: "0", icon: Users, change: "+0%" },
  { title: "Conversas ativas", value: "0", icon: MessageCircle, change: "+0%" },
  { title: "Taxa de conversão", value: "0%", icon: TrendingUp, change: "+0%" },
  { title: "Mensagens hoje", value: "0", icon: BarChart3, change: "+0%" },
];

const Dashboard = () => {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral do seu CRM</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.change} desde o mês passado</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Atividade recente</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Funil de vendas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Nenhum dado de funil disponível.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
