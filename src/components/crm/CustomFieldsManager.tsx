import React, { useState } from "react";
import { useCustomFieldDefinitions, type CustomFieldDefinition } from "@/hooks/use-custom-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Plus, Pencil, Trash2, GripVertical, X } from "lucide-react";
import { toast } from "sonner";

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Texto", number: "Número", date: "Data", select: "Seleção única",
  multi_select: "Seleção múltipla", boolean: "Sim/Não", phone: "Telefone",
  email: "E-mail", url: "URL", currency: "Moeda (R$)",
};

type FieldFormData = {
  field_label: string;
  field_key: string;
  field_type: CustomFieldDefinition["field_type"];
  field_options: string[];
  is_required: boolean;
  is_visible_kanban: boolean;
  is_visible_list: boolean;
  placeholder: string;
};

const EMPTY_FORM: FieldFormData = {
  field_label: "", field_key: "", field_type: "text", field_options: [],
  is_required: false, is_visible_kanban: false, is_visible_list: false, placeholder: "",
};

function labelToKey(label: string) {
  return label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

interface FieldFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<FieldFormData>;
  onSave: (data: FieldFormData) => void;
  title: string;
  loading?: boolean;
}

function FieldFormDialog({ open, onOpenChange, initial, onSave, title, loading }: FieldFormDialogProps) {
  const [form, setForm] = useState<FieldFormData>({ ...EMPTY_FORM, ...initial });
  const [newOption, setNewOption] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);

  React.useEffect(() => {
    if (open) { setForm({ ...EMPTY_FORM, ...initial }); setKeyEdited(false); }
  }, [open, initial]);

  const set = <K extends keyof FieldFormData>(k: K, v: FieldFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleLabelChange = (label: string) => {
    set("field_label", label);
    if (!keyEdited) set("field_key", labelToKey(label));
  };

  const hasOptions = form.field_type === "select" || form.field_type === "multi_select";

  const addOption = () => {
    if (!newOption.trim() || form.field_options.includes(newOption.trim())) return;
    set("field_options", [...form.field_options, newOption.trim()]);
    setNewOption("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label className="text-xs">Rótulo do campo *</Label>
            <Input value={form.field_label} onChange={(e) => handleLabelChange(e.target.value)} className="h-8 text-sm" autoFocus placeholder="Ex: Tamanho do Anel" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Chave (identificador)</Label>
            <Input
              value={form.field_key}
              onChange={(e) => { set("field_key", e.target.value); setKeyEdited(true); }}
              className="h-8 text-sm font-mono"
              placeholder="tamanho_anel"
            />
            <p className="text-[10px] text-muted-foreground">Chave única, sem espaços</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={form.field_type} onValueChange={(v) => set("field_type", v as CustomFieldDefinition["field_type"])}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FIELD_TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasOptions && (
            <div className="space-y-1.5">
              <Label className="text-xs">Opções</Label>
              <div className="flex flex-wrap gap-1 min-h-[32px] rounded-md border border-input p-1.5">
                {form.field_options.map((opt) => (
                  <Badge key={opt} variant="secondary" className="gap-1 text-[10px]">
                    {opt}
                    <button onClick={() => set("field_options", form.field_options.filter((o) => o !== opt))}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addOption()}
                  placeholder="Nova opção..."
                  className="h-7 text-sm flex-1"
                />
                <Button size="sm" variant="outline" onClick={addOption} className="h-7 px-2">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Placeholder</Label>
            <Input value={form.placeholder} onChange={(e) => set("placeholder", e.target.value)} className="h-8 text-sm" placeholder="Texto de exemplo..." />
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
            <Label className="text-xs font-semibold">Visibilidade</Label>
            {[
              { label: "Obrigatório", key: "is_required" as const },
              { label: "Visível no Kanban", key: "is_visible_kanban" as const },
              { label: "Visível na lista (coluna)", key: "is_visible_list" as const },
            ].map(({ label, key }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm">{label}</span>
                <Switch checked={form[key] as boolean} onCheckedChange={(v) => set(key, v)} />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" disabled={!form.field_label.trim() || !form.field_key.trim() || loading} onClick={() => onSave(form)}>
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CustomFieldsManagerProps {
  entityType?: "contact" | "deal";
}

export function CustomFieldsManager({ entityType = "contact" }: CustomFieldsManagerProps) {
  const { fields, isLoading, createField, updateField, deleteField, reorderFields } = useCustomFieldDefinitions(entityType);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomFieldDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldDefinition | null>(null);

  const handleCreate = (form: FieldFormData) => {
    createField.mutate(
      { ...form, entity_type: entityType, order: fields.length, default_value: null },
      {
        onSuccess: () => { toast.success("Campo criado"); setShowCreate(false); },
        onError: (e: unknown) => toast.error(`Erro: ${(e as Error).message}`),
      }
    );
  };

  const handleEdit = (form: FieldFormData) => {
    if (!editTarget) return;
    updateField.mutate(
      { id: editTarget.id, ...form },
      {
        onSuccess: () => { toast.success("Campo atualizado"); setEditTarget(null); },
        onError: () => toast.error("Erro ao atualizar campo"),
      }
    );
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(fields);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    reorderFields.mutate(reordered.map((f) => f.id));
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Campos adicionais para {entityType === "contact" ? "contatos" : "vendas"}. Arraste para reordenar.
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Novo Campo
        </Button>
      </div>

      {fields.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
          Nenhum campo personalizado criado ainda
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId={`custom-fields-${entityType}`}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {fields.map((field, index) => (
                <Draggable key={field.id} draggableId={field.id} index={index}>
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
                        <p className="text-sm font-medium">{field.field_label}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{field.field_key}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-5">
                          {FIELD_TYPE_LABELS[field.field_type] || field.field_type}
                        </Badge>
                        {field.is_required && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 h-5 bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400">
                            Obrigatório
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditTarget(field)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeleteTarget(field)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-950 text-muted-foreground hover:text-destructive transition-colors">
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

      <FieldFormDialog open={showCreate} onOpenChange={setShowCreate} title="Novo campo" onSave={handleCreate} loading={createField.isPending} />
      <FieldFormDialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        title="Editar campo"
        initial={editTarget ? { ...editTarget, placeholder: editTarget.placeholder || "" } : undefined}
        onSave={handleEdit}
        loading={updateField.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteTarget?.field_label}"?
              Os dados deste campo em todos os {entityType === "contact" ? "contatos" : "vendas"} serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteField.mutate(deleteTarget.id, { onSuccess: () => { toast.success("Campo excluído"); setDeleteTarget(null); }, onError: () => toast.error("Erro") })}
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
