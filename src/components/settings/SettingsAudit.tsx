import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function SettingsAudit() {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Auditoria</h2>
        <p className="text-sm text-muted-foreground">Histórico de ações realizadas no sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log de Atividades</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : activities.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma atividade registrada
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-border max-h-[500px] overflow-y-auto">
              {activities.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-2.5">
                  <Badge variant="secondary" className="text-[10px] shrink-0">{a.type}</Badge>
                  <span className="text-sm flex-1 truncate">{a.content || "—"}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {a.created_at
                      ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
