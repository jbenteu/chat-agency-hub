import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PipelineStagesConfig } from "./PipelineStagesConfig";
import { TagSelector, TAG_COLORS } from "@/components/whatsapp/TagSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CRMSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---- Origins Manager ----
const DEFAULT_ORIGINS = [
  { value: "manual", label: "Manual" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "landing_page", label: "Landing Page" },
  { value: "indicacao", label: "Indicação" },
];

const ORIGINS_KEY = "crm-custom-origins";
const LIFECYCLE_KEY = "crm-custom-lifecycle";

function loadFromStorage(key: string, defaults: { value: string; label: string }[]) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as { value: string; label: string }[];
  } catch {}
  return defaults;
}

function OptionsManager({
  storageKey,
  defaults,
  title,
  description,
}: {
  storageKey: string;
  defaults: { value: string; label: string }[];
  title: string;
  description: string;
}) {
  const [items, setItems] = useState(() => loadFromStorage(storageKey, defaults));
  const [newLabel, setNewLabel] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const save = (next: { value: string; label: string }[]) => {
    setItems(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (items.find((i) => i.value === value)) {
      toast.error("Já existe uma opção com esse nome");
      return;
    }
    save([...items, { value, label }]);
    setNewLabel("");
    toast.success(`"${label}" adicionado`);
  };

  const handleDelete = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    save(next);
    toast.success("Opção removida");
  };

  const handleEdit = (idx: number) => {
    const label = editLabel.trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const next = items.map((item, i) => (i === idx ? { value, label } : item));
    save(next);
    setEditIdx(null);
    toast.success("Opção atualizada");
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {items.map((item, idx) => (
          <div key={item.value} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 group">
            {editIdx === idx ? (
              <>
                <Input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="h-7 text-xs flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleEdit(idx);
                    if (e.key === "Escape") setEditIdx(null);
                  }}
                />
                <button onClick={() => handleEdit(idx)} className="p-1 rounded hover:bg-muted">
                  <Check className="h-3.5 w-3.5 text-green-600" />
                </button>
                <button onClick={() => setEditIdx(null)} className="p-1 rounded hover:bg-muted">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </>
            ) : (
              <>
                <span className="text-sm flex-1">{item.label}</span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditIdx(idx); setEditLabel(item.label); }}
                    className="p-1 rounded hover:bg-muted"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => handleDelete(idx)}
                    className="p-1 rounded hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-1 pt-1 border-t border-border">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nova opção..."
          className="h-7 text-xs flex-1"
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        />
        <Button size="sm" className="h-7 text-xs gap-1 px-2" onClick={handleAdd} disabled={!newLabel.trim()}>
          <Plus className="h-3 w-3" /> Adicionar
        </Button>
      </div>
    </div>
  );
}

// ---- Tags Manager (reuses existing TagSelector DB logic) ----
function TagsManager() {
  const [tags] = useState<string[]>([]);
  // We use TagSelector with a dummy state just for the management UI
  const [dummyTags, setDummyTags] = useState<string[]>([]);
  
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Gerencie as tags disponíveis para contatos e deals. As alterações são aplicadas globalmente.
      </p>
      <TagSelector tags={dummyTags} onChange={setDummyTags} />
      <p className="text-[10px] text-muted-foreground">
        Clique para selecionar/deselecionar. Use os ícones de edição e lixeira ao passar o mouse para gerenciar.
      </p>
    </div>
  );
}

const DEFAULT_LIFECYCLE = [
  { value: "lead", label: "Lead" },
  { value: "prospect", label: "Prospect" },
  { value: "customer", label: "Cliente" },
  { value: "inactive", label: "Inativo" },
];

export function CRMSettingsDialog({ open, onOpenChange }: CRMSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Configurações do Kanban</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="stages" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-full">
            <TabsTrigger value="stages" className="text-xs flex-1">Etapas</TabsTrigger>
            <TabsTrigger value="tags" className="text-xs flex-1">Tags</TabsTrigger>
            <TabsTrigger value="origins" className="text-xs flex-1">Origem</TabsTrigger>
            <TabsTrigger value="lifecycle" className="text-xs flex-1">Estágio de Vida</TabsTrigger>
          </TabsList>

          <TabsContent value="stages" className="flex-1 overflow-y-auto mt-3">
            <PipelineStagesConfig />
          </TabsContent>

          <TabsContent value="tags" className="flex-1 overflow-y-auto mt-3">
            <TagsManager />
          </TabsContent>

          <TabsContent value="origins" className="flex-1 overflow-y-auto mt-3">
            <OptionsManager
              storageKey={ORIGINS_KEY}
              defaults={DEFAULT_ORIGINS}
              title="Origens"
              description="Gerencie as opções de origem dos contatos. Será refletido na edição de contatos e filtros."
            />
          </TabsContent>

          <TabsContent value="lifecycle" className="flex-1 overflow-y-auto mt-3">
            <OptionsManager
              storageKey={LIFECYCLE_KEY}
              defaults={DEFAULT_LIFECYCLE}
              title="Estágio de Vida"
              description="Gerencie os estágios de vida dos contatos (Lead, Prospect, Cliente, etc.)."
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Export helpers for other components to read custom options
export function getCustomOrigins() {
  return loadFromStorage(ORIGINS_KEY, DEFAULT_ORIGINS);
}

export function getCustomLifecycleStages() {
  return loadFromStorage(LIFECYCLE_KEY, DEFAULT_LIFECYCLE);
}
