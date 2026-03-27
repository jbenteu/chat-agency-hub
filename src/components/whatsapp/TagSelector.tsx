import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Check, X, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const TAG_COLORS = [
  { name: "Azul", bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500", hex: "#3b82f6" },
  { name: "Verde", bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", hex: "#10b981" },
  { name: "Roxo", bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500", hex: "#8b5cf6" },
  { name: "Laranja", bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500", hex: "#f97316" },
  { name: "Rosa", bg: "bg-pink-100 dark:bg-pink-900/40", text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500", hex: "#ec4899" },
  { name: "Amarelo", bg: "bg-yellow-100 dark:bg-yellow-900/40", text: "text-yellow-700 dark:text-yellow-300", dot: "bg-yellow-500", hex: "#eab308" },
  { name: "Vermelho", bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300", dot: "bg-red-500", hex: "#ef4444" },
  { name: "Cinza", bg: "bg-gray-100 dark:bg-gray-800/40", text: "text-gray-700 dark:text-gray-300", dot: "bg-gray-500", hex: "#6b7280" },
];

interface TagRecord {
  id?: string;
  name: string;
  color: string;
}

let globalTagsCache: TagRecord[] | null = null;

function getTagColorStyle(tag: string): typeof TAG_COLORS[number] {
  const cached = globalTagsCache?.find((t) => t.name === tag);
  if (cached?.color) {
    const match = TAG_COLORS.find((c) => c.hex === cached.color);
    if (match) return match;
  }
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function getColorDot(hex: string): string {
  const match = TAG_COLORS.find((c) => c.hex === hex);
  return match?.dot || "bg-gray-500";
}

interface TagSelectorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  readOnly?: boolean;
  onCreateTag?: (name: string, color: string) => Promise<void>;
}

export function TagSelector({ tags, onChange, readOnly = false, onCreateTag }: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [globalTags, setGlobalTags] = useState<TagRecord[]>(globalTagsCache || []);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(0);

  const loadGlobalTags = useCallback(async () => {
    try {
      const { data } = await supabase.from("tags").select("id, name, color").order("name");
      if (data) {
        globalTagsCache = data;
        setGlobalTags(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open) loadGlobalTags();
  }, [open, loadGlobalTags]);

  const toggleTag = (tagName: string) => {
    if (tags.includes(tagName)) {
      onChange(tags.filter((t) => t !== tagName));
    } else {
      onChange([...tags, tagName]);
    }
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim().toLowerCase();
    if (!name) return;
    setCreating(true);
    try {
      const hex = TAG_COLORS[newTagColor].hex;
      if (onCreateTag) {
        await onCreateTag(name, hex);
      }
      const newTag = { name, color: hex };
      setGlobalTags((prev) => [...prev, newTag]);
      globalTagsCache = [...(globalTagsCache || []), newTag];
      if (!tags.includes(name)) onChange([...tags, name]);
      setNewTagName("");
      setNewTagColor(0);
    } catch { /* ignore */ }
    finally { setCreating(false); }
  };

  const handleEditTag = async (originalName: string) => {
    const tag = globalTags.find((t) => t.name === originalName);
    if (!tag?.id || !editName.trim()) return;
    const newName = editName.trim().toLowerCase();
    const newHex = TAG_COLORS[editColor].hex;
    try {
      await supabase.from("tags").update({ name: newName, color: newHex } as never).eq("id", tag.id);
      // Update local state
      setGlobalTags((prev) => prev.map((t) => t.id === tag.id ? { ...t, name: newName, color: newHex } : t));
      globalTagsCache = globalTagsCache?.map((t) => t.id === tag.id ? { ...t, name: newName, color: newHex } : t) || null;
      // Update selected tags if the name changed
      if (originalName !== newName && tags.includes(originalName)) {
        onChange(tags.map((t) => t === originalName ? newName : t));
      }
      toast.success("Tag atualizada");
      setEditingTag(null);
    } catch {
      toast.error("Erro ao atualizar tag");
    }
  };

  const handleDeleteTag = async (tagName: string) => {
    const tag = globalTags.find((t) => t.name === tagName);
    if (!tag?.id) return;
    try {
      await supabase.from("tags").delete().eq("id", tag.id);
      setGlobalTags((prev) => prev.filter((t) => t.id !== tag.id));
      globalTagsCache = globalTagsCache?.filter((t) => t.id !== tag.id) || null;
      if (tags.includes(tagName)) onChange(tags.filter((t) => t !== tagName));
      toast.success("Tag excluída");
    } catch {
      toast.error("Erro ao excluir tag");
    }
  };

  const startEdit = (tagName: string) => {
    const tag = globalTags.find((t) => t.name === tagName);
    setEditingTag(tagName);
    setEditName(tagName);
    const colorIdx = TAG_COLORS.findIndex((c) => c.hex === tag?.color);
    setEditColor(colorIdx >= 0 ? colorIdx : 0);
  };

  const allTagNames = Array.from(new Set([...globalTags.map((t) => t.name), ...tags]));

  if (readOnly) {
    return (
      <div className="flex flex-wrap gap-1">
        {tags.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma tag</span>}
        {tags.map((t) => {
          const color = getTagColorStyle(t);
          return (
            <Badge key={t} variant="secondary" className={`text-[10px] h-4 ${color.bg} ${color.text} border-0`}>
              <span className={`mr-1 h-1.5 w-1.5 rounded-full inline-block ${color.dot}`} />
              {t}
            </Badge>
          );
        })}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex flex-wrap gap-1 items-center min-h-[24px] w-full text-left">
          {tags.length === 0 && <span className="text-xs text-muted-foreground">Selecionar tags…</span>}
          {tags.map((t) => {
            const color = getTagColorStyle(t);
            return (
              <Badge key={t} variant="secondary" className={`text-[10px] h-4 ${color.bg} ${color.text} border-0`}>
                <span className={`mr-1 h-1.5 w-1.5 rounded-full inline-block ${color.dot}`} />
                {t}
              </Badge>
            );
          })}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground px-1">Tags disponíveis</p>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {allTagNames.map((name) => {
              const isSelected = tags.includes(name);
              const color = getTagColorStyle(name);
              const tag = globalTags.find((t) => t.name === name);

              if (editingTag === name) {
                return (
                  <div key={name} className="p-1.5 rounded-md bg-muted/50 space-y-1">
                    <div className="flex items-center gap-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-6 text-[11px] flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEditTag(name);
                          if (e.key === "Escape") setEditingTag(null);
                        }}
                      />
                      <button onClick={() => handleEditTag(name)} className="p-0.5 hover:bg-muted rounded">
                        <Check className="h-3 w-3 text-green-600" />
                      </button>
                      <button onClick={() => setEditingTag(null)} className="p-0.5 hover:bg-muted rounded">
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="flex gap-1 px-0.5">
                      {TAG_COLORS.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => setEditColor(i)}
                          className={`h-3.5 w-3.5 rounded-full ${c.dot} ${editColor === i ? "ring-2 ring-primary ring-offset-1" : ""}`}
                        />
                      ))}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={name}
                  className="flex items-center gap-2 w-full rounded-md px-2 py-1 text-xs hover:bg-muted transition-colors group/tag"
                >
                  <button onClick={() => toggleTag(name)} className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${color.dot}`} />
                    <span className="flex-1 text-left truncate">{name}</span>
                    {isSelected && <Check className="h-3 w-3 text-primary flex-shrink-0" />}
                  </button>
                  {tag?.id && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover/tag:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => startEdit(name)} className="p-0.5 rounded hover:bg-muted-foreground/10">
                        <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDeleteTag(name)} className="p-0.5 rounded hover:bg-destructive/10">
                        <Trash2 className="h-2.5 w-2.5 text-destructive" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {allTagNames.length === 0 && (
              <p className="text-[11px] text-muted-foreground px-2 py-1">Nenhuma tag criada</p>
            )}
          </div>
          
          <div className="border-t border-border pt-2">
            <p className="text-[11px] font-medium text-muted-foreground px-1 mb-1">+ Criar nova</p>
            <div className="flex gap-1">
              <Input
                className="h-6 text-[11px] flex-1"
                placeholder="Nome da tag"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateTag(); }}
              />
              <Button size="icon" className="h-6 w-6 shrink-0" onClick={handleCreateTag} disabled={!newTagName.trim() || creating}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex gap-1 mt-1 px-1">
              {TAG_COLORS.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setNewTagColor(i)}
                  className={`h-4 w-4 rounded-full ${c.dot} ${newTagColor === i ? "ring-2 ring-primary ring-offset-1" : ""}`}
                  title={c.name}
                />
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { getTagColorStyle, TAG_COLORS };
