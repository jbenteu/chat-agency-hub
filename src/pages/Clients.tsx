import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { InviteDialog } from "@/components/invite/InviteDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, UserCheck } from "lucide-react";
import { format } from "date-fns";

interface Client {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  is_active: boolean;
  creator_name: string | null;
}

const Clients = () => {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page: "1", limit: "50" });
      const { data, error } = await supabase.functions.invoke("get-my-clients?" + params.toString(), {
        method: "GET",
      });

      if (!error && data) {
        setClients(data.clients ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (e) {
      console.error("Erro ao buscar clientes:", e);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timeout = setTimeout(fetchClients, 300);
    return () => clearTimeout(timeout);
  }, [fetchClients]);

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
            <p className="text-sm text-muted-foreground">{total} cliente{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}</p>
          </div>
          <InviteDialog defaultRole="cliente" />
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <UserCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">Nenhum cliente encontrado</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={client.avatar_url ?? undefined} />
                            <AvatarFallback className="text-xs">{getInitials(client.full_name)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-sm">{client.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{client.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{client.creator_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(client.created_at), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant={client.is_active ? "default" : "secondary"} className={client.is_active ? "bg-green-600/20 text-green-400 border-green-600/30" : ""}>
                          {client.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Clients;
