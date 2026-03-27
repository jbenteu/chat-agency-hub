import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, Trash2, AlertCircle } from "lucide-react";
import { formatDistanceToNow, format, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTasks, type Task } from "@/hooks/use-tasks";
import { useContacts } from "@/hooks/use-contacts";
import { toast } from "sonner";

const TASK_TYPE_LABELS: Record<string, string> = {
  follow_up: "Follow-up",
  call: "Ligação",
  meeting: "Reunião",
  email: "E-mail",
  whatsapp: "WhatsApp",
  other: "Outro",
};

const PRIORITY_CONFIG: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

interface TaskItemProps {
  task: Task;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}

function TaskItem({ task, onComplete, onDelete }: TaskItemProps) {
  const isCompleted = !!task.completed_at;
  const isOverdue = !isCompleted && isPast(new Date(task.due_date));

  return (
    <div className={`flex items-start gap-3 p-2.5 rounded-lg border transition-colors ${
      isCompleted ? "bg-muted/30 opacity-60" : isOverdue ? "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900" : "bg-background border-border"
    }`}>
      <Checkbox
        checked={isCompleted}
        onCheckedChange={() => !isCompleted && onComplete(task.id)}
        disabled={isCompleted}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground">
            {TASK_TYPE_LABELS[task.task_type] || task.task_type}
          </span>
          <span className={`flex items-center gap-1 text-[10px] ${isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
            {isOverdue && <AlertCircle className="h-3 w-3" />}
            <Clock className="h-3 w-3" />
            {isCompleted
              ? `Concluída ${formatDistanceToNow(new Date(task.completed_at!), { locale: ptBR, addSuffix: true })}`
              : format(new Date(task.due_date), "dd/MM · HH:mm")}
          </span>
          {!isCompleted && (
            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
              {PRIORITY_CONFIG[task.priority] || task.priority}
            </Badge>
          )}
        </div>
      </div>
      {!isCompleted && (
        <button
          onClick={() => onDelete(task.id)}
          className="text-muted-foreground hover:text-destructive transition-colors mt-0.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

interface CRMTaskListProps {
  contactId: string;
  tenantId: string;
}

export function CRMTaskList({ contactId, tenantId }: CRMTaskListProps) {
  const { tasks, createTask, completeTask, deleteTask } = useTasks({ contact_id: contactId });
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState("follow_up");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");

  const pending = tasks.filter((t) => !t.completed_at);
  const completed = tasks.filter((t) => t.completed_at);

  const handleCreate = () => {
    if (!title.trim() || !dueDate) return;
    createTask.mutate(
      {
        tenant_id: tenantId,
        contact_id: contactId,
        deal_id: null,
        title: title.trim(),
        description: null,
        task_type: taskType,
        due_date: new Date(dueDate).toISOString(),
        assigned_to: null,
        created_by: null,
        priority,
        completed_at: null,
      },
      {
        onSuccess: () => {
          toast.success("Tarefa criada");
          setTitle("");
          setDueDate("");
          setTaskType("follow_up");
          setPriority("medium");
          setShowForm(false);
        },
        onError: () => toast.error("Erro ao criar tarefa"),
      }
    );
  };

  return (
    <div className="space-y-3 p-4">
      {/* Pending tasks */}
      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onComplete={(id) => completeTask.mutate(id)}
              onDelete={(id) => deleteTask.mutate(id)}
            />
          ))}
        </div>
      )}

      {pending.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tarefa pendente</p>
      )}

      {/* New task form */}
      {showForm && (
        <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
          <Input
            placeholder="Título da tarefa..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger className="h-8 text-sm mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-8 text-sm mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_CONFIG).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Data e hora</Label>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-8 text-sm mt-1"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} className="h-7 text-xs">Cancelar</Button>
            <Button size="sm" onClick={handleCreate} disabled={!title.trim() || !dueDate} className="h-7 text-xs">
              Criar tarefa
            </Button>
          </div>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowForm(true)}
        className="w-full h-8 text-xs gap-1.5 border-dashed"
      >
        <Plus className="h-3.5 w-3.5" /> Nova Tarefa
      </Button>

      {/* Completed tasks */}
      {completed.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground font-medium">Concluídas ({completed.length})</p>
          {completed.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onComplete={() => {}}
              onDelete={(id) => deleteTask.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
