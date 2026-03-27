import React, { useState, useMemo } from "react";
import { useContacts, type Contact } from "@/hooks/use-contacts";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Users, MessageCircle, Edit, Trash2, X } from "lucide-react";
import { formatPhoneWhatsApp } from "@/data/country-codes";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ContactFormDialog } from "./ContactFormDialog";
import { ContactDrawer } from "./ContactDrawer";
import { useToast } from "@/hooks/use-toast";

const STATUS_CHIPS = [
  { label: "Todos", value: "" },
  { label: "Novo Lead", value: "novo_lead" },
  { label: "Em Contato", value: "em_contato" },
  { label: "Qualificado", value: "qualificado" },
  { label: "Cliente", value: "cliente" },
  { label: "Inativo", value: "inativo" },
];

export function ContactsTable() {
  const [search, setSearch] = useState("");
  const [statusChip, setStatusChip] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);

  const { contacts, isLoading, deleteContact } = useContacts({
    search: search || undefined,
  });
  const { toast } = useToast();

  const filteredContacts = useMemo(() => {
    let result = contacts;
    // Status chip filter (based on tags or deal stage)
    if (statusChip) {
      result = result.filter((c) => {
        const tags = (c.tags || []).map((t) => t.toLowerCase());
        const chipLower = statusChip.replace("_", " ");
        if (tags.includes(chipLower)) return true;
        // Check if any deal matches the stage
        const dealStages = (c.deals || []).map((d) => d.stage.toLowerCase());
        return dealStages.some((s) => s.includes(chipLower));
      });
    }
    return result;
  }, [contacts, statusChip]);

  const hasFilters = !!(search || statusChip);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteContact.mutateAsync(deleteTarget.id);
      toast({ title: "Contato excluído" });
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  const getOriginInfo = (contact: Contact) => {
    const hasWhatsApp = contact.whatsapp_conversations && contact.whatsapp_conversations.length > 0;
    return hasWhatsApp
      ? { label: "WhatsApp", className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" }
      : { label: "Manual", className: "bg-muted text-muted-foreground" };
  };

  const getLastActivity = (contact: Contact) => {
    const convDates = (contact.whatsapp_conversations || [])
      .map((c) => c.last_message_at)
      .filter(Boolean) as string[];
    if (convDates.length === 0) return null;
    const latest = convDates.sort().reverse()[0];
    return latest;
  };

  const clearFilters = () => {
    setSearch("");
    setStatusChip("");
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo contato
        </Button>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setStatusChip(chip.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusChip === chip.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {chip.label}
          </button>
        ))}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs ml-2">
            <X className="h-3 w-3 mr-1" /> Limpar filtros
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Users className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum contato encontrado</p>
          <Button variant="outline" className="mt-3" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar contato
          </Button>
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground mb-1">
            {filteredContacts.length} contato{filteredContacts.length !== 1 ? "s" : ""}
            {hasFilters ? " (filtrado)" : ""}
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="hidden md:table-cell">Origem</TableHead>
                  <TableHead className="hidden md:table-cell">Negociações</TableHead>
                  <TableHead className="hidden lg:table-cell">Valor Total</TableHead>
                  <TableHead className="hidden lg:table-cell">Última Atividade</TableHead>
                  <TableHead className="hidden lg:table-cell">Criado em</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts.map((contact) => {
                  const origin = getOriginInfo(contact);
                  const dealsCount = contact.deals?.length || 0;
                  const totalValue = (contact.deals || []).reduce((s, d) => s + (d.value || 0), 0);
                  const lastActivity = getLastActivity(contact);

                  return (
                    <TableRow
                      key={contact.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedContact(contact)}
                    >
                      <TableCell className="font-medium">{contact.name}</TableCell>
                      <TableCell className="text-sm">
                        {contact.phone ? formatPhoneWhatsApp(contact.phone) : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="secondary" className={`text-[10px] ${origin.className}`}>
                          {origin.label === "WhatsApp" && <MessageCircle className="h-3 w-3 mr-1" />}
                          {origin.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {dealsCount > 0 ? `${dealsCount} deal${dealsCount > 1 ? "s" : ""}` : "—"}
                      </TableCell>
                      <TableCell className={`hidden lg:table-cell text-sm tabular-nums ${totalValue > 0 ? "text-green-700 dark:text-green-400 font-medium" : "text-muted-foreground"}`}>
                        {totalValue > 0
                          ? totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {lastActivity
                          ? formatDistanceToNow(new Date(lastActivity), { addSuffix: true, locale: ptBR })
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {contact.created_at ? new Date(contact.created_at).toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          {contact.phone && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                              <a href="/whatsapp"><MessageCircle className="h-3.5 w-3.5 text-green-600" /></a>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedContact(contact)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(contact)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <ContactDrawer
        contact={selectedContact}
        open={!!selectedContact}
        onOpenChange={(o) => !o && setSelectedContact(null)}
      />
      <ContactFormDialog open={showAddDialog} onOpenChange={setShowAddDialog} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteTarget?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
