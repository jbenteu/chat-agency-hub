import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PipelineStagesConfig } from "@/components/crm/PipelineStagesConfig";

export function SettingsPipeline() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Pipeline</h2>
        <p className="text-sm text-muted-foreground">Configure os estágios do funil de vendas</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estágios do Pipeline</CardTitle>
          <CardDescription>Arraste para reordenar. Máximo de 12 estágios.</CardDescription>
        </CardHeader>
        <CardContent>
          <PipelineStagesConfig />
        </CardContent>
      </Card>
    </div>
  );
}
