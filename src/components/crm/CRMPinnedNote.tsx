import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pin, Pencil, Check, X } from "lucide-react";
import { useContacts } from "@/hooks/use-contacts";
import { toast } from "sonner";

interface CRMPinnedNoteProps {
  contactId: string;
  pinnedNote: string | null;
}

export function CRMPinnedNote({ contactId, pinnedNote }: CRMPinnedNoteProps) {
  const { updateContact } = useContacts();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pinnedNote || "");

  const handleSave = () => {
    updateContact.mutate(
      { id: contactId, pinned_note: draft || null },
      {
        onSuccess: () => {
          toast.success("Nota fixada salva");
          setEditing(false);
        },
        onError: () => toast.error("Erro ao salvar nota"),
      }
    );
  };

  const handleCancel = () => {
    setDraft(pinnedNote || "");
    setEditing(false);
  };

  if (!pinnedNote && !editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-amber-300 hover:text-amber-600 transition-colors"
      >
        <Pin className="h-3.5 w-3.5" />
        Adicionar nota fixada de contexto...
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3">
      <div className="flex items-start gap-2">
        <Pin className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Nota de contexto rápido (ex: cliente quer aliança ouro branco, orçamento até 8k)..."
                className="text-xs min-h-[72px] bg-white dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 resize-none"
                autoFocus
              />
              <div className="flex gap-1.5 justify-end">
                <Button size="sm" variant="ghost" onClick={handleCancel} className="h-7 text-xs">
                  <X className="h-3 w-3 mr-1" /> Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} className="h-7 text-xs bg-amber-600 hover:bg-amber-700">
                  <Check className="h-3 w-3 mr-1" /> Salvar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed whitespace-pre-wrap">
                {pinnedNote}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setDraft(pinnedNote || ""); setEditing(true); }}
                className="h-6 w-6 p-0 text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900 flex-shrink-0"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
