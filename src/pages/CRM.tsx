import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { DealsTable } from "@/components/crm/DealsTable";
import { ContactsTable } from "@/components/crm/ContactsTable";
import { LayoutGrid, List, Users } from "lucide-react";

const CRM = () => {
  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus contatos e negociações</p>
        </div>

        <Tabs defaultValue="kanban" className="w-full">
          <TabsList>
            <TabsTrigger value="kanban" className="gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </TabsTrigger>
            <TabsTrigger value="lista" className="gap-1.5">
              <List className="h-3.5 w-3.5" />
              Lista
            </TabsTrigger>
            <TabsTrigger value="contatos" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Contatos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="mt-4">
            <KanbanBoard />
          </TabsContent>

          <TabsContent value="lista" className="mt-4">
            <DealsTable />
          </TabsContent>

          <TabsContent value="contatos" className="mt-4">
            <ContactsTable />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default CRM;
