import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";

const WhatsAppInbox = () => {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conversas</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie suas conversas do WhatsApp
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <MessageCircle className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">
              Nenhuma conversa ainda
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              As conversas aparecerão aqui quando alguém enviar uma mensagem.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default WhatsAppInbox;
