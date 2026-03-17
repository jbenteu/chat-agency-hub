import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

const CRM = () => {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus contatos e negociações</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum contato cadastrado</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Adicione seu primeiro contato para começar</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default CRM;
