import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Copy, Search } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getTenantId } from "@/hooks/use-contacts";

const VARIABLES = ["{{nome}}", "{{empresa}}", "{{telefone}}", "{{link}}"];

export function SettingsQuickReplies() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formShortcut, setFormShortcut] = useState("");
  const [formContent, setFormContent] = useState("");

  const { data: replies = [], isLoading } = useQuery({
    queryKey: ["quick_replies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quick_replies").select("*").order("title");
      if (error) throw error;
      return data || [];
    },
  });

  const createReply = useMutation({
    mutationFn: async () => {
      const tenantId = await getTenantId();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("quick_replies").insert({
        title: formTitle.trim(),
        shortcut: formShortcut.trim() || null,
        content: formContent.trim(),
        tenant_id: tenantId,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick_replies"] });
      toast.success("Resposta rápida criada!");
      setShowCreate(false);
      resetForm();
    },
    onError: () => toast.error("Erro ao criar"),
  });

  const updateReply = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      const { error } = await supabase.from("quick_replies").update({
        title: formTitle.trim(),
        shortcut: formShortcut.trim() || null,
        content: formContent.trim(),
      }).eq("id", editTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick_replies"] });
      toast.success("Atualizada!");
      setEditTarget(null);
      resetForm();
    },
    onError: () => toast.error("Erro ao atualizar"),
  });

  const removeReply = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_replies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick_replies"] });
      toast.success("Excluída!");
      setDeleteTarget(null);
    },
  });

  const duplicateReply = useMutation({
    mutationFn: async (reply: any) => {
      const tenantId = await getTenantId();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("quick_replies").insert({
        title: `${reply.title} (cópia)`,
        shortcut: null,
        content: reply.content,
        tenant_id: tenantId,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick_replies"] });
      toast.success("Duplicada!");
    },
  });

  const resetForm = () => { setFormTitle(""); setFormShortcut(""); setFormContent(""); };

  const openEdit = (r: any) => {
    setEditTarget(r);
    setFormTitle(r.title);
    setFormShortcut(r.shortcut || "");
    setFormContent(r.content);
  };

  const openCreate = () => { resetForm(); setShowCreate(true); };

  const insertVariable = (v: string) => {
    setFormContent((prev) => prev + v);
  };

  const filtered = replies.filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    (r.shortcut && r.shortcut.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Respostas Rápidas</h2>
        <p className="text-sm text-muted-foreground">Atalhos de texto para agilizar o atendimento no WhatsApp</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="h-8 pl-8 text-sm" />
            </div>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Nova Resposta
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
              {search ? "Nenhuma resposta encontrada" : "Nenhuma resposta rápida criada"}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20 border-border hover:bg-muted/40 group transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium">{r.title}</span>
                      {r.shortcut && (
                        <Badge variant="secondary" className="text-[10px] font-mono">{r.shortcut}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{r.content}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => duplicateReply.mutate(r)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleteTarget(r)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-950 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate || !!editTarget} onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar Resposta" : "Nova Resposta Rápida"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Título *</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} className="h-8 text-sm" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Shortcut</Label>
              <Input
                value={formShortcut}
                onChange={(e) => {
                  let v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                  if (v && !v.startsWith("/")) v = "/" + v;
                  setFormShortcut(v);
                }}
                className="h-8 text-sm font-mono"
                placeholder="/boa-tarde"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Conteúdo *</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                className="min-h-[100px] text-sm"
                placeholder="Olá {{nome}}, tudo bem?"
              />
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map((v) => (
                  <Button key={v} variant="outline" size="sm" className="h-6 text-[10px] px-2 font-mono" onClick={() => insertVariable(v)}>
                    {v}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowCreate(false); setEditTarget(null); }}>Cancelar</Button>
            <Button size="sm" disabled={!formTitle.trim() || !formContent.trim() || createReply.isPending || updateReply.isPending}
              onClick={() => editTarget ? updateReply.mutate() : createReply.mutate()}>
              {(createReply.isPending || updateReply.isPending) ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir resposta rápida</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir "{deleteTarget?.title}"?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && removeReply.mutate(deleteTarget.id)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
