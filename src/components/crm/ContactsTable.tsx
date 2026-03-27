import React, { useState, useMemo } from "react";
import { useContacts, getTenantId, type Contact } from "@/hooks/use-contacts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRAZIL_STATES } from "@/data/brazil-locations";
import { formatPhoneWhatsApp } from "@/data/country-codes";
import { Plus, Search, Users } from "lucide-react";
import { ContactFormDialog } from "./ContactFormDialog";
import { ContactDrawer } from "./ContactDrawer";

export function ContactsTable() {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [originFilter, setOriginFilter] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const { contacts, isLoading } = useContacts({
    search: search || undefined,
    state: stateFilter || undefined,
  });

  const filteredContacts = useMemo(() => {
    if (!originFilter) return contacts;
    return contacts.filter((c) => (c.origin || "manual") === originFilter);
  }, [contacts, originFilter]);

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contatos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={stateFilter} onValueChange={(v) => setStateFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos estados</SelectItem>
            {BRAZIL_STATES.map((s) => (
              <SelectItem key={s.uf} value={s.uf}>{s.uf}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={originFilter} onValueChange={(v) => setOriginFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="whatsapp_import">Importado</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Novo contato
        </Button>
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
            <Plus className="h-4 w-4 mr-1" />
            Adicionar contato
          </Button>
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground mb-1">
            {filteredContacts.length} contato{filteredContacts.length !== 1 ? "s" : ""}
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="hidden md:table-cell">E-mail</TableHead>
                  <TableHead className="hidden md:table-cell">Empresa</TableHead>
                  <TableHead className="hidden lg:table-cell">Tags</TableHead>
                  <TableHead className="hidden lg:table-cell">Origem</TableHead>
                  <TableHead className="hidden lg:table-cell">Cidade/Estado</TableHead>
                  <TableHead className="hidden lg:table-cell">Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts.map((contact) => (
                  <TableRow
                    key={contact.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedContact(contact)}
                  >
                    <TableCell className="font-medium">{contact.name}</TableCell>
                    <TableCell className="text-sm">
                      {contact.phone ? formatPhoneWhatsApp(contact.phone) : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{contact.email || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{contact.company || "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {(contact.tags || []).slice(0, 2).map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant="outline" className="text-[10px]">{contact.origin || "manual"}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {[contact.city, contact.state].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {contact.created_at ? new Date(contact.created_at).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
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
    </div>
  );
}
