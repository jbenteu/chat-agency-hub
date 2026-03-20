import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ConversationFilter = "all" | "unread" | "groups" | "archived";

interface ConversationFiltersProps {
  value: ConversationFilter;
  onChange: (value: ConversationFilter) => void;
  unreadCount?: number;
}

export function ConversationFilters({ value, onChange, unreadCount }: ConversationFiltersProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as ConversationFilter)} className="w-full">
      <TabsList className="w-full h-7 bg-muted/60 p-0.5 gap-0">
        <TabsTrigger value="all" className="flex-1 h-6 text-[11px] px-1.5 data-[state=active]:shadow-none">
          Todas
        </TabsTrigger>
        <TabsTrigger value="unread" className="flex-1 h-6 text-[11px] px-1.5 data-[state=active]:shadow-none">
          Não lidas
          {unreadCount ? (
            <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="groups" className="flex-1 h-6 text-[11px] px-1.5 data-[state=active]:shadow-none">
          Grupos
        </TabsTrigger>
        <TabsTrigger value="archived" className="flex-1 h-6 text-[11px] px-1.5 data-[state=active]:shadow-none">
          Arquivadas
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
