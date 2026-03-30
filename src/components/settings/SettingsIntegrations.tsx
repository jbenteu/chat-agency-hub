import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plug, ExternalLink } from "lucide-react";

const INTEGRATIONS = [
  {
    name: "Evolution API",
    description: "Integração WhatsApp via Evolution API",
    status: "soon" as const,
    icon: "💬",
  },
  {
    name: "Meta Ads",
    description: "Facebook e Instagram Ads",
    status: "soon" as const,
    icon: "📱",
  },
  {
    name: "Google Ads",
    description: "Campanhas do Google Ads",
    status: "soon" as const,
    icon: "🔍",
  },
  {
    name: "Webhooks",
    description: "Receba leads de formulários externos",
    status: "soon" as const,
    icon: "🔗",
  },
];

export function SettingsIntegrations() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Integrações</h2>
        <p className="text-sm text-muted-foreground">Conecte com outras ferramentas e plataformas</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {INTEGRATIONS.map((int) => (
          <Card key={int.name}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{int.icon}</span>
                  <div>
                    <CardTitle className="text-base">{int.name}</CardTitle>
                    <CardDescription className="text-xs">{int.description}</CardDescription>
                  </div>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  Em breve
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" disabled className="text-xs">
                Disponível em breve
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
