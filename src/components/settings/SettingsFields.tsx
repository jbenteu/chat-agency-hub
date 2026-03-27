import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomFieldsManager } from "@/components/crm/CustomFieldsManager";

export function SettingsFields() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Campos Personalizados</h2>
        <p className="text-sm text-muted-foreground">Adicione campos extras para contatos e negociações</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="contacts">
            <TabsList className="mb-4">
              <TabsTrigger value="contacts">Contatos</TabsTrigger>
              <TabsTrigger value="deals">Negociações</TabsTrigger>
            </TabsList>
            <TabsContent value="contacts">
              <CustomFieldsManager />
            </TabsContent>
            <TabsContent value="deals">
              <div className="py-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                Campos de negociação em breve
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
