import React, { useState } from "react";
import { usePipeline, type PipelineStage } from "@/hooks/use-pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Plus, Pencil, Trash2, GripVertical, Trophy, XCircle, UserPlus, MessageCircle } from "lucide-react";
import { toast } from "sonner";

const STAGE_COLORS = [
  "#3B82F6", "#F59E0B", "#F97316", "#8B5CF6",
  "#22C55E", "#EF4444", "#06B6D4", "#EC4899",
  "#84CC16", "#6366F1", "#14B8A6", "#F43F5E",
];

interface StageFormData {
  name: string;
  color: string;
  is_closed: boolean;
  is_won: boolean;
}

const EMPTY_FORM: StageFormData = {
  name: "",
  color: "#3B82F6",
  is_closed: false,
  is_won: false,
};

interface StageFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<StageFormData>;
  onSave: (data: StageFormData) => void;
  title: string;
  loading?: boolean;
}

function StageFormDialog({ open, onOpenChange, initial, onSave, title, loading }: StageFormDialogProps) {
  const [form, setForm] = useState<StageFormData>({ ...EMPTY_FORM, ...initial });

  const set = <K extends keyof StageFormData>(k: K, v: StageFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Sync with initial when dialog opens
  React.useEffect(() => {
    if (open) setForm({ ...EMPTY_FORM, ...initial });
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome do estágio *</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ex: Em análise"
              className="h-8 text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Cor</Label>
            <div className="flex flex-wrap gap-2">
              {STAGE_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => set("color", color)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: form.color === color ? "white" : "transparent",
                    boxShadow: form.color === color ? `0 0 0 2px ${color}` : "none",
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="h-6 w-6 rounded-full" style={{ backgroundColor: form.color }} />
              <Input
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                placeholder="#3B82F6"
                className="h-7 text-xs w-28 font-mono"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
            <Label className="text-xs font-semibold">Comportamento</Label>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Estágio fechado</p>
                <p className="text-[11px] text-muted-foreground">Deals neste estágio são considerados finalizados</p>
              </div>
              <Switch
                checked={form.is_closed}
                onCheckedChange={(v) => {
                  set("is_closed", v);
                  if (!v) set("is_won", false);
                }}
              />
            </div>
            {form.is_closed && (
              <div className="flex items-center justify-between pt-1 border-t border-border">
                <div>
                  <p className="text-sm">Ganho (vitória)</p>
                  <p className="text-[11px] text-muted-foreground">Conta nos relatórios como deal ganho</p>
                </div>
                <Switch
                  checked={form.is_won}
                  onCheckedChange={(v) => set("is_won", v)}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!form.name.trim() || loading}
            onClick={() => onSave(form)}
          >
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PipelineStagesConfig() {
  const { stages, isLoading, createStage, updateStage, deleteStage } = usePipeline();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<PipelineStage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PipelineStage | null>(null);

  const handleCreate = (form: StageFormData) => {
    const maxOrder = stages.reduce((m, s) => Math.max(m, s.order), -1);
    createStage.mutate(
      { ...form, order: maxOrder + 1 },
      {
        onSuccess: () => { toast.success("Estágio criado"); setShowCreate(false); },
        onError: () => toast.error("Erro ao criar estágio"),
      }
    );
  };

  const handleEdit = (form: StageFormData) => {
    if (!editTarget) return;
    updateStage.mutate(
      { id: editTarget.id, ...form },
      {
        onSuccess: () => { toast.success("Estágio atualizado"); setEditTarget(null); },
        onError: () => toast.error("Erro ao atualizar estágio"),
      }
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteStage.mutate(deleteTarget.id, {
      onSuccess: () => { toast.success("Estágio excluído"); setDeleteTarget(null); },
      onError: () => toast.error("Erro ao excluir estágio"),
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(stages);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    reordered.forEach((stage, idx) => {
      if (stage.order !== idx) {
        updateStage.mutate({ id: stage.id, order: idx });
      }
    });
  };

  if (isLoading) return <div className="text-sm text-muted-foreground py-4">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Arraste para reordenar. Máximo de 12 estágios.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(true)}
          disabled={stages.length >= 12}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Novo Estágio
        </Button>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="pipeline-stages">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {stages.map((stage, index) => (
                <Draggable key={stage.id} draggableId={stage.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-shadow ${
                        snapshot.isDragging
                          ? "shadow-lg bg-card"
                          : "bg-muted/20 border-border hover:bg-muted/40"
                      }`}
                    >
                      <div {...provided.dragHandleProps} className="text-muted-foreground cursor-grab active:cursor-grabbing">
                        <GripVertical className="h-4 w-4" />
                      </div>

                      <div
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stage.color || "#6366f1" }}
                      />

                      <span className="text-sm font-medium flex-1 truncate">{stage.name}</span>

                      <div className="flex items-center gap-1.5">
                        {stage.is_won && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 h-5 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                            <Trophy className="h-2.5 w-2.5 mr-1" />Ganho
                          </Badge>
                        )}
                        {stage.is_closed && !stage.is_won && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 h-5 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
                            <XCircle className="h-2.5 w-2.5 mr-1" />Perdido
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditTarget(stage)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(stage)}
                          className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-950 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Create dialog */}
      <StageFormDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        title="Novo estágio"
        onSave={handleCreate}
        loading={createStage.isPending}
      />

      {/* Edit dialog */}
      <StageFormDialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        title="Editar estágio"
        initial={editTarget || undefined}
        onSave={handleEdit}
        loading={updateStage.isPending}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir estágio</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteTarget?.name}"?
              Os deals neste estágio serão mantidos, mas ficarão sem estágio definido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
