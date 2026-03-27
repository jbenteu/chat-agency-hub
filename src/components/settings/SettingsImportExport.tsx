import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, FileSpreadsheet, MessageCircle, Users, DollarSign, Activity } from "lucide-react";
import { toast } from "sonner";

export function SettingsImportExport() {
  const handleExport = (type: string) => {
    toast.info(`Exportação de ${type} será implementada em breve`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Importar / Exportar</h2>
        <p className="text-sm text-muted-foreground">Importe e exporte dados do CRM</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Importar Contatos
          </CardTitle>
          <CardDescription>Faça upload de um arquivo CSV ou XLSX com seus contatos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-muted-foreground/50 transition-colors cursor-pointer">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Arraste um arquivo aqui ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground mt-1">CSV ou XLSX, máximo 10MB</p>
            <Button variant="outline" size="sm" className="mt-4">
              <Upload className="mr-2 h-4 w-4" /> Selecionar arquivo
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" /> Exportar Dados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { label: "Contatos", icon: Users, desc: "Todos os contatos do CRM" },
              { label: "Negociações", icon: DollarSign, desc: "Histórico de deals" },
              { label: "Atividades", icon: Activity, desc: "Log de atividades" },
              { label: "Mensagens WhatsApp", icon: MessageCircle, desc: "Histórico de conversas" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => handleExport(item.label)}>
                  <Download className="h-3 w-3" /> CSV
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
