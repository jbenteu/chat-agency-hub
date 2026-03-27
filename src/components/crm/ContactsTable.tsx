import React, { useState, useMemo } from "react";
import { useContacts, type Contact } from "@/hooks/use-contacts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, MessageCircle, Edit, Trash2, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CRMContactDrawer } from "./CRMContactDrawer";
import { ContactFormDialog } from "./ContactFormDialog";
import { CRMScoreBadge } from "./CRMScoreBadge";
import { toast } from "sonner";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual", whatsapp: "WhatsApp", instagram: "Instagram",
  facebook: "Facebook", landing_page: "Landing Page", indicacao: "Indicação",
};
const LIFECYCLE_LABEL: Record<string, string> = {
  lead: "Lead", prospect: "Prospect", customer: "Cliente", inactive: "Inativo",
};
const LIFECYCLE_COLOR: Record<string, string> = {
  lead: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  prospect: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  customer: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  inactive: "bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-400",
};

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 45%)`;
}

export function ContactsTable() {
  const [search, setSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  const { contacts, isLoading, deleteContact } = useContacts({
    search: search || undefined,
    lifecycle_stage: lifecycleFilter || undefined,
  });

  const filtered = useMemo(() => contacts, [contacts]);

  const toggleAll = () => {
    if (bulkSelected.size === filtered.length) setBulkSelected(new Set());
    else setBulkSelected(new Set(filtered.map((c) => c.id)));
  };

  const handleDelete = (contact: Contact) => {
    deleteContact.mutate(contact.id, {
      onSuccess: () => { toast.success("Contato excluído"); setDeleteTarget(null); },
      onError: () => toast.error("Erro ao excluir contato"),
    });
  };

  const handleBulkDelete = () => {
    if (!confirm(`Excluir ${bulkSelected.size} contato(s)?`)) return;
    bulkSelected.forEach((id) => deleteContact.mutate(id));
    setBulkSelected(new Set());
  };

  if (isLoading) return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
    </div>
  );

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar contato..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Lifecycle filter chips */}
        <div className="flex items-center gap-1.5">
          {[{ label: "Todos", value: "" }, { label: "Lead", value: "lead" }, { label: "Prospect", value: "prospect" }, { label: "Cliente", value: "customer" }, { label: "Inativo", value: "inactive" }].map((chip) => (
            <button
              key={chip.value}
              onClick={() => setLifecycleFilter(chip.value)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                lifecycleFilter === chip.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {bulkSelected.size > 0 && (
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">{bulkSelected.size} selecionados</span>
            <Button size="sm" variant="destructive" onClick={handleBulkDelete} className="h-7 text-xs">Excluir</Button>
          </div>
        )}

        <Button onClick={() => setShowAddDialog(true)} size="sm" className="h-8 gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Novo Contato
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Nenhum contato encontrado</p>
          <p className="text-xs text-muted-foreground mt-1">Crie um novo contato ou ajuste a busca</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="h-10 bg-muted/30">
                <TableHead className="w-10 pl-3">
                  <Checkbox checked={bulkSelected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Contato</TableHead>
                <TableHead className="hidden md:table-cell text-xs font-medium text-muted-foreground">Telefone</TableHead>
                <TableHead className="hidden lg:table-cell text-xs font-medium text-muted-foreground">Origem</TableHead>
                <TableHead className="hidden lg:table-cell text-xs font-medium text-muted-foreground">Vendas</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Lifecycle</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Score</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Última atividade</TableHead>
                <TableHead className="w-24 text-xs font-medium text-muted-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((contact) => {
                const color = getAvatarColor(contact.name);
                const initials = contact.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                const dealsCount = contact.deals?.length || 0;
                const lifecycle = contact.lifecycle_stage || "lead";
                const lastActivity = contact.last_contact_at || contact.updated_at;
                const tags = contact.tags || [];

                return (
                  <TableRow
                    key={contact.id}
                    className="h-12 cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setSelectedContact(contact)}
                  >
                    <TableCell className="pl-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={bulkSelected.has(contact.id)}
                        onCheckedChange={(checked) => {
                          const next = new Set(bulkSelected);
                          checked ? next.add(contact.id) : next.delete(contact.id);
                          setBulkSelected(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6 flex-shrink-0">
                          <AvatarFallback className="text-[9px] font-semibold text-white" style={{ backgroundColor: color }}>
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate max-w-[140px]">{contact.name}</p>
                          {contact.email && <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">{contact.email}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {contact.phone || "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {contact.source ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-5 font-normal">
                          {SOURCE_LABEL[contact.source] || contact.source}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {dealsCount > 0 ? (
                        <span className="text-sm text-muted-foreground">{dealsCount} deal{dealsCount !== 1 ? "s" : ""}</span>
                      ) : <span className="text-sm text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-[10px] px-1.5 h-5 font-medium ${LIFECYCLE_COLOR[lifecycle] || ""}`}>
                        {LIFECYCLE_LABEL[lifecycle] || lifecycle}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <CRMScoreBadge score={contact.score || 0} />
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {lastActivity
                        ? formatDistanceToNow(new Date(lastActivity), { locale: ptBR, addSuffix: true })
                        : "—"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => window.open("/whatsapp", "_self")}
                          className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-950 text-green-600 transition-colors"
                          title="Abrir WhatsApp"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setSelectedContact(contact)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(contact)}
                          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950 text-muted-foreground hover:text-destructive transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedContact && (
        <CRMContactDrawer
          contact={selectedContact}
          open={!!selectedContact}
          onOpenChange={(open) => !open && setSelectedContact(null)}
        />
      )}

      <ContactFormDialog
        open={showAddDialog}
        onOpenChange={(open) => { if (!open) setShowAddDialog(false); }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteTarget?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
