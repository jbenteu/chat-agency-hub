import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";

const WhatsApp = () => {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas conversas e instâncias</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <MessageCircle className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">Nenhuma instância conectada</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Configure sua instância do WhatsApp para começar</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default WhatsApp;
