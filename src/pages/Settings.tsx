import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon } from "lucide-react";

const SettingsPage = () => {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">Gerencie as configurações do seu tenant</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <SettingsIcon className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">Configurações em breve</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default SettingsPage;
