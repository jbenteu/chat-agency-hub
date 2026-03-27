import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getTenantId } from "@/hooks/use-contacts";

const TAG_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#22C55E",
  "#14B8A6", "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6",
  "#A855F7", "#D946EF", "#EC4899", "#F43F5E", "#78716C",
  "#64748B", "#0EA5E9", "#10B981", "#FBBF24", "#FB923C",
];

export function SettingsTags() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTag, setEditTag] = useState<{ id: string; name: string; color: string } | null>(null);
  const [deleteTag, setDeleteTag] = useState<{ id: string; name: string; count: number } | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(TAG_COLORS[0]);

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Count usage per tag
  const { data: contactTags = [] } = useQuery({
    queryKey: ["contacts-tags-count"],
    queryFn: async () => {
      const { data } = await supabase.from("contacts").select("tags");
      return data || [];
    },
  });

  const getTagCount = (tagName: string) => {
    return contactTags.filter((c) => c.tags?.includes(tagName)).length;
  };

  const createTag = useMutation({
    mutationFn: async () => {
      const tenantId = await getTenantId();
      const { error } = await supabase.from("tags").insert({
        name: formName.trim(), color: formColor, tenant_id: tenantId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      toast.success("Tag criada!");
      setShowCreate(false);
      setFormName("");
    },
    onError: () => toast.error("Erro ao criar tag"),
  });

  const updateTag = useMutation({
    mutationFn: async () => {
      if (!editTag) return;
      const { error } = await supabase.from("tags").update({
        name: formName.trim(), color: formColor,
      }).eq("id", editTag.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      toast.success("Tag atualizada!");
      setEditTag(null);
      setFormName("");
    },
    onError: () => toast.error("Erro ao atualizar tag"),
  });

  const removeTag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      toast.success("Tag excluída!");
      setDeleteTag(null);
    },
    onError: () => toast.error("Erro ao excluir tag"),
  });

  const filtered = tags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (tag: { id: string; name: string; color: string | null }) => {
    setEditTag({ id: tag.id, name: tag.name, color: tag.color || TAG_COLORS[0] });
    setFormName(tag.name);
    setFormColor(tag.color || TAG_COLORS[0]);
  };

  const openCreate = () => {
    setFormName("");
    setFormColor(TAG_COLORS[0]);
    setShowCreate(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Tags</h2>
        <p className="text-sm text-muted-foreground">Gerencie as tags para organizar contatos</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tags..."
                className="h-8 pl-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Nova Tag
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
              {search ? "Nenhuma tag encontrada" : "Nenhuma tag criada ainda"}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {filtered.map((tag) => {
                const count = getTagCount(tag.name);
                return (
                  <div
                    key={tag.id}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:bg-muted/30 group transition-colors"
                  >
                    <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color || "#6366f1" }} />
                    <span className="text-sm font-medium flex-1 truncate">{tag.name}</span>
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{count}</Badge>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(tag)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setDeleteTag({ id: tag.id, name: tag.name, count })}
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog
        open={showCreate || !!editTag}
        onOpenChange={(open) => {
          if (!open) { setShowCreate(false); setEditTag(null); }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTag ? "Editar Tag" : "Nova Tag"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nome da tag" className="h-8 text-sm" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cor</Label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((c) => (
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
            <Button variant="outline" size="sm" onClick={() => { setShowCreate(false); setEditTag(null); }}>Cancelar</Button>
            <Button
              size="sm"
              disabled={!formName.trim() || createTag.isPending || updateTag.isPending}
              onClick={() => editTag ? updateTag.mutate() : createTag.mutate()}
            >
              {(createTag.isPending || updateTag.isPending) ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTag} onOpenChange={(open) => !open && setDeleteTag(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tag "{deleteTag?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTag && deleteTag.count > 0
                ? `Esta tag está em ${deleteTag.count} contato(s). Deseja continuar?`
                : "Esta tag será removida permanentemente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTag && removeTag.mutate(deleteTag.id)}
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
