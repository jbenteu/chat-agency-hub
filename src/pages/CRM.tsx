import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { DealsTable } from "@/components/crm/DealsTable";
import { ContactsTable } from "@/components/crm/ContactsTable";
import { LayoutGrid, List, Users } from "lucide-react";

const CRM = () => {
  return (
    <AppLayout noPadding>
      <div className="flex flex-col h-screen">
        <Tabs defaultValue="kanban" className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-background">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold tracking-tight">CRM</h1>
              <TabsList className="h-8">
                <TabsTrigger value="kanban" className="gap-1.5 text-xs h-7 px-2.5">
                  <LayoutGrid className="h-3 w-3" />
                  Kanban
                </TabsTrigger>
                <TabsTrigger value="lista" className="gap-1.5 text-xs h-7 px-2.5">
                  <List className="h-3 w-3" />
                  Vendas
                </TabsTrigger>
                <TabsTrigger value="contatos" className="gap-1.5 text-xs h-7 px-2.5">
                  <Users className="h-3 w-3" />
                  Contatos
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="kanban" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            <KanbanBoard />
          </TabsContent>

          <TabsContent value="lista" className="flex-1 min-h-0 mt-0 overflow-auto px-4 py-3">
            <DealsTable />
          </TabsContent>

          <TabsContent value="contatos" className="flex-1 min-h-0 mt-0 overflow-auto px-4 py-3">
            <ContactsTable />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default CRM;
