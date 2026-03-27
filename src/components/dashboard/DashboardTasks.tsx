import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Phone, Mail, Users, CalendarDays, Clock } from "lucide-react";
import { format, isPast, isToday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { TaskItem } from "@/hooks/useDashboardData";

const TASK_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  follow_up: CheckSquare,
  task: CheckSquare,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

interface DashboardTasksProps {
  data: TaskItem[] | undefined;
  loading: boolean;
}

export function DashboardTasks({ data, loading }: DashboardTasksProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            Tarefas Pendentes
          </CardTitle>
          {data && data.length > 0 && (
            <Badge variant="secondary" className="text-xs">{data.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-px p-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />)}
          </div>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-4">
            Nenhuma tarefa pendente
          </p>
        ) : (
          <div className="divide-y divide-border max-h-[280px] overflow-y-auto">
            {data.map((task) => {
              const Icon = TASK_ICONS[task.task_type] || CheckSquare;
              const dueDate = task.due_date ? parseISO(task.due_date) : null;
              const isOverdue = dueDate ? isPast(dueDate) : false;
              const isDueToday = dueDate ? isToday(dueDate) : false;

              return (
                <div key={task.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30">
                  <div className="p-1 rounded bg-muted mt-0.5 shrink-0">
                    <Icon className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{task.title}</p>
                    {dueDate && (
                      <p
                        className={cn(
                          "text-[11px] flex items-center gap-1",
                          isOverdue
                            ? "text-red-500"
                            : isDueToday
                            ? "text-amber-500"
                            : "text-muted-foreground"
                        )}
                      >
                        {isOverdue ? (
                          <Clock className="h-2.5 w-2.5" />
                        ) : (
                          <CalendarDays className="h-2.5 w-2.5" />
                        )}
                        {isOverdue
                          ? "Atrasada"
                          : isDueToday
                          ? "Hoje"
                          : format(dueDate, "dd/MM", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                  {task.priority && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                        PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.low
                      )}
                    >
                      {PRIORITY_LABELS[task.priority] || task.priority}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
