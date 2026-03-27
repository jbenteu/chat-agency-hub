import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { useLossReasons, type LossReason } from "@/hooks/use-loss-reasons";

const SUGGESTIONS = [
  "Preço fora do orçamento",
  "Comprou no concorrente",
  "Sem interesse",
  "Produto indisponível",
  "Não respondeu",
  "Timing ruim",
];

export function SettingsLossReasons() {
  const { reasons, isLoading, create, update, remove } = useLossReasons();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<LossReason | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LossReason | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");

  const openCreate = () => { setFormName(""); setFormDesc(""); setShowCreate(true); };
  const openEdit = (r: LossReason) => {
    setEditTarget(r);
    setFormName(r.name);
    setFormDesc(r.description || "");
  };

  const handleSave = () => {
    if (editTarget) {
      update.mutate({ id: editTarget.id, name: formName.trim(), description: formDesc.trim() || null }, {
        onSuccess: () => { toast.success("Motivo atualizado"); setEditTarget(null); },
        onError: () => toast.error("Erro ao atualizar"),
      });
    } else {
      create.mutate({ name: formName.trim(), description: formDesc.trim() || undefined }, {
        onSuccess: () => { toast.success("Motivo criado"); setShowCreate(false); },
        onError: () => toast.error("Erro ao criar"),
      });
    }
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(reasons);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    reordered.forEach((r, idx) => {
      if (r.order !== idx) update.mutate({ id: r.id, order: idx });
    });
  };

  const addSuggestion = (name: string) => {
    create.mutate({ name }, {
      onSuccess: () => toast.success(`"${name}" adicionado`),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Motivos de Perda</h2>
        <p className="text-sm text-muted-foreground">Configure os motivos para negociações perdidas</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Motivos cadastrados</CardTitle>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Novo Motivo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : reasons.length === 0 ? (
            <div className="py-6 text-center space-y-4">
              <p className="text-sm text-muted-foreground">Nenhum motivo cadastrado</p>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Sugestões rápidas:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} variant="outline" size="sm" className="text-xs h-7"
                      onClick={() => addSuggestion(s)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> {s}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="loss-reasons">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {reasons.map((r, index) => (
                      <Draggable key={r.id} draggableId={r.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center gap-3 p-3 rounded-lg border transition-shadow ${
                              snapshot.isDragging ? "shadow-lg bg-card" : "bg-muted/20 border-border hover:bg-muted/40"
                            }`}
                          >
                            <div {...provided.dragHandleProps} className="text-muted-foreground cursor-grab">
                              <GripVertical className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{r.name}</p>
                              {r.description && <p className="text-[11px] text-muted-foreground truncate">{r.description}</p>}
                            </div>
                            <Switch
                              checked={r.is_active}
                              onCheckedChange={(v) => update.mutate({ id: r.id, is_active: v })}
                            />
                            <div className="flex gap-1">
                              <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setDeleteTarget(r)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-950 text-muted-foreground hover:text-destructive">
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
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate || !!editTarget} onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar Motivo" : "Novo Motivo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="h-8 text-sm" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição (opcional)</Label>
              <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} className="h-8 text-sm" placeholder="Detalhes adicionais..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowCreate(false); setEditTarget(null); }}>Cancelar</Button>
            <Button size="sm" disabled={!formName.trim() || create.isPending || update.isPending} onClick={handleSave}>
              {(create.isPending || update.isPending) ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir motivo</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir "{deleteTarget?.name}"?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && remove.mutate(deleteTarget.id, { onSuccess: () => { toast.success("Excluído"); setDeleteTarget(null); } })} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
