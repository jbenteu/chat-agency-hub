import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomFieldsManager } from "@/components/crm/CustomFieldsManager";
import { Skeleton } from "@/components/ui/skeleton";

export function SettingsFields() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Campos Personalizados</h2>
        <p className="text-sm text-muted-foreground">Adicione campos extras para contatos e vendas</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="contacts">
            <TabsList className="mb-4">
              <TabsTrigger value="contacts">Contatos</TabsTrigger>
              <TabsTrigger value="deals">Negociações</TabsTrigger>
            </TabsList>
            <TabsContent value="contacts">
              <CustomFieldsManager entityType="contact" />
            </TabsContent>
            <TabsContent value="deals">
              <CustomFieldsManager entityType="deal" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
