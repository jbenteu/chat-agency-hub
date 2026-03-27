import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, StickyNote, Phone, Mail, MessageCircle, Users, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { useActivityTypes, type ActivityType } from "@/hooks/use-activity-types";

const ICON_OPTIONS = [
  { value: "nota", label: "Nota", icon: StickyNote },
  { value: "ligacao", label: "Ligação", icon: Phone },
  { value: "email", label: "E-mail", icon: Mail },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "reuniao", label: "Reunião", icon: Users },
  { value: "tarefa", label: "Tarefa", icon: CheckSquare },
];

const TYPE_COLORS = [
  "#F59E0B", "#3B82F6", "#8B5CF6", "#22C55E", "#6366F1",
  "#EF4444", "#06B6D4", "#EC4899", "#F97316", "#14B8A6",
];

const getIcon = (name: string | null) => {
  const found = ICON_OPTIONS.find((o) => o.value === name);
  return found?.icon || StickyNote;
};

export function SettingsActivityTypes() {
  const { types, isLoading, create, update, remove } = useActivityTypes();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ActivityType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActivityType | null>(null);
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState("nota");
  const [formColor, setFormColor] = useState(TYPE_COLORS[0]);

  const openCreate = () => { setFormName(""); setFormIcon("nota"); setFormColor(TYPE_COLORS[0]); setShowCreate(true); };
  const openEdit = (t: ActivityType) => {
    setEditTarget(t);
    setFormName(t.name);
    setFormIcon(t.icon || "nota");
    setFormColor(t.color || TYPE_COLORS[0]);
  };

  const handleSave = () => {
    if (editTarget) {
      update.mutate({ id: editTarget.id, name: formName.trim(), icon: formIcon, color: formColor }, {
        onSuccess: () => { toast.success("Tipo atualizado"); setEditTarget(null); },
        onError: () => toast.error("Erro"),
      });
    } else {
      create.mutate({ name: formName.trim(), icon: formIcon, color: formColor }, {
        onSuccess: () => { toast.success("Tipo criado"); setShowCreate(false); },
        onError: () => toast.error("Erro"),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Tipos de Atividade</h2>
        <p className="text-sm text-muted-foreground">Configure os tipos de atividade da timeline</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Tipos cadastrados</CardTitle>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Novo Tipo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : types.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
              Nenhum tipo cadastrado
            </div>
          ) : (
            <div className="space-y-2">
              {types.map((t) => {
                const Icon = getIcon(t.icon);
                return (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20 border-border hover:bg-muted/40 group transition-colors">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: (t.color || "#6366f1") + "20" }}>
                      <Icon className="h-4 w-4" style={{ color: t.color || "#6366f1" }} />
                    </div>
                    <span className="text-sm font-medium flex-1">{t.name}</span>
                    {t.is_default && <Badge variant="secondary" className="text-[10px]">Padrão</Badge>}
                    <Switch
                      checked={t.is_active}
                      onCheckedChange={(v) => update.mutate({ id: t.id, is_active: v })}
                    />
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!t.is_default && (
                        <button onClick={() => setDeleteTarget(t)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-950 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate || !!editTarget} onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar Tipo" : "Novo Tipo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="h-8 text-sm" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cor</Label>
              <div className="flex flex-wrap gap-2">
                {TYPE_COLORS.map((c) => (
                  <button key={c} onClick={() => setFormColor(c)}
                    className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: formColor === c ? "white" : "transparent",
                      boxShadow: formColor === c ? `0 0 0 2px ${c}` : "none",
                    }}
                  />
                ))}
              </div>
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
            <AlertDialogTitle>Excluir tipo</AlertDialogTitle>
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
