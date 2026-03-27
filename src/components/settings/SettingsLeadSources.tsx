import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Instagram, Facebook, Globe, MessageCircle, Users, Mail, Megaphone, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useLeadSources, type LeadSource } from "@/hooks/use-lead-sources";

const ICON_OPTIONS = [
  { value: "instagram", label: "Instagram", icon: Instagram },
  { value: "facebook", label: "Facebook", icon: Facebook },
  { value: "google", label: "Google Ads", icon: Globe },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "indicacao", label: "Indicação", icon: Users },
  { value: "site", label: "Site", icon: Globe },
  { value: "tiktok", label: "TikTok", icon: Share2 },
  { value: "email", label: "Email", icon: Mail },
  { value: "evento", label: "Evento", icon: Megaphone },
  { value: "outro", label: "Outro", icon: Globe },
];

const SOURCE_COLORS = [
  "#E1306C", "#1877F2", "#4285F4", "#25D366", "#6366F1",
  "#3B82F6", "#000000", "#EF4444", "#F59E0B", "#78716C",
];

const getIconComponent = (iconName: string | null) => {
  const found = ICON_OPTIONS.find((o) => o.value === iconName);
  return found?.icon || Globe;
};

export function SettingsLeadSources() {
  const { sources, isLoading, create, update, remove } = useLeadSources();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<LeadSource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadSource | null>(null);
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState("outro");
  const [formColor, setFormColor] = useState(SOURCE_COLORS[0]);

  const openCreate = () => { setFormName(""); setFormIcon("outro"); setFormColor(SOURCE_COLORS[0]); setShowCreate(true); };
  const openEdit = (s: LeadSource) => {
    setEditTarget(s);
    setFormName(s.name);
    setFormIcon(s.icon || "outro");
    setFormColor(s.color || SOURCE_COLORS[0]);
  };

  const handleSave = () => {
    if (editTarget) {
      update.mutate({ id: editTarget.id, name: formName.trim(), icon: formIcon, color: formColor }, {
        onSuccess: () => { toast.success("Origem atualizada"); setEditTarget(null); },
        onError: () => toast.error("Erro ao atualizar"),
      });
    } else {
      create.mutate({ name: formName.trim(), icon: formIcon, color: formColor }, {
        onSuccess: () => { toast.success("Origem criada"); setShowCreate(false); },
        onError: () => toast.error("Erro ao criar"),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Origens de Lead</h2>
        <p className="text-sm text-muted-foreground">Configure de onde seus leads chegam</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Origens cadastradas</CardTitle>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Nova Origem
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : sources.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
              Nenhuma origem cadastrada. Clique em "+ Nova Origem" para começar.
            </div>
          ) : (
            <div className="space-y-2">
              {sources.map((s) => {
                const Icon = getIconComponent(s.icon);
                return (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20 border-border hover:bg-muted/40 group transition-colors">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: (s.color || "#6366f1") + "20" }}>
                      <Icon className="h-4 w-4" style={{ color: s.color || "#6366f1" }} />
                    </div>
                    <span className="text-sm font-medium flex-1">{s.name}</span>
                    <Switch
                      checked={s.is_active}
                      onCheckedChange={(v) => update.mutate({ id: s.id, is_active: v })}
                    />
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!s.is_default && (
                        <button onClick={() => setDeleteTarget(s)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-950 text-muted-foreground hover:text-destructive">
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
            <DialogTitle>{editTarget ? "Editar Origem" : "Nova Origem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="h-8 text-sm" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ícone</Label>
              <Select value={formIcon} onValueChange={setFormIcon}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-2">
                        <o.icon className="h-3.5 w-3.5" /> {o.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cor</Label>
              <div className="flex flex-wrap gap-2">
                {SOURCE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFormColor(c)}
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
            <AlertDialogTitle>Excluir origem</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir "{deleteTarget?.name}"?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && remove.mutate(deleteTarget.id, { onSuccess: () => { toast.success("Excluída"); setDeleteTarget(null); } })} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
