import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X, Check } from "lucide-react";

const TAG_COLORS = [
  { name: "Azul", bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  { name: "Verde", bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  { name: "Roxo", bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500" },
  { name: "Laranja", bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  { name: "Rosa", bg: "bg-pink-100 dark:bg-pink-900/40", text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500" },
  { name: "Amarelo", bg: "bg-yellow-100 dark:bg-yellow-900/40", text: "text-yellow-700 dark:text-yellow-300", dot: "bg-yellow-500" },
  { name: "Vermelho", bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300", dot: "bg-red-500" },
  { name: "Cinza", bg: "bg-gray-100 dark:bg-gray-800/40", text: "text-gray-700 dark:text-gray-300", dot: "bg-gray-500" },
];

// Module-level cache for global tags
let globalTagsCache: { name: string; color: number }[] | null = null;

function getTagColor(tag: string, index: number) {
  const cached = globalTagsCache?.find((t) => t.name === tag);
  if (cached) return TAG_COLORS[cached.color % TAG_COLORS.length];
  // Hash-based color for uncached tags
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

interface TagSelectorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  readOnly?: boolean;
}

export function TagSelector({ tags, onChange, readOnly = false }: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [globalTags, setGlobalTags] = useState<{ name: string; color: number }[]>(globalTagsCache || []);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(0);
  const [creating, setCreating] = useState(false);

  const loadGlobalTags = useCallback(async () => {
    try {
      const { data } = await supabase.from("tags").select("name, color").order("name");
      if (data) {
        const mapped = data.map((t: any) => ({ name: t.name, color: typeof t.color === "number" ? t.color : 0 }));
        globalTagsCache = mapped;
        setGlobalTags(mapped);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open && !globalTagsCache) loadGlobalTags();
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
      await supabase.from("tags").insert({ name, color: newTagColor });
      const newTag = { name, color: newTagColor };
      setGlobalTags((prev) => [...prev, newTag]);
      globalTagsCache = [...(globalTagsCache || []), newTag];
      if (!tags.includes(name)) onChange([...tags, name]);
      setNewTagName("");
      setNewTagColor(0);
    } catch { /* ignore - may already exist */ }
    finally { setCreating(false); }
  };

  // Available tags = global tags + current tags (deduped)
  const allTagNames = Array.from(new Set([...globalTags.map((t) => t.name), ...tags]));

  if (readOnly) {
    return (
      <div className="flex flex-wrap gap-1">
        {tags.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma tag</span>}
        {tags.map((t, i) => {
          const color = getTagColor(t, i);
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
          {tags.map((t, i) => {
            const color = getTagColor(t, i);
            return (
              <Badge key={t} variant="secondary" className={`text-[10px] h-4 ${color.bg} ${color.text} border-0`}>
                <span className={`mr-1 h-1.5 w-1.5 rounded-full inline-block ${color.dot}`} />
                {t}
              </Badge>
            );
          })}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground px-1">Tags disponíveis</p>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {allTagNames.map((name) => {
              const isSelected = tags.includes(name);
              const color = getTagColor(name, 0);
              return (
                <button
                  key={name}
                  onClick={() => toggleTag(name)}
                  className="flex items-center gap-2 w-full rounded-md px-2 py-1 text-xs hover:bg-muted transition-colors"
                >
                  <span className={`h-2 w-2 rounded-full ${color.dot}`} />
                  <span className="flex-1 text-left">{name}</span>
                  {isSelected && <Check className="h-3 w-3 text-primary" />}
                </button>
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

export { getTagColor, TAG_COLORS };
