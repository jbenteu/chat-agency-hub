import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { InviteDialog } from "@/components/invite/InviteDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Search, UserCheck, ChevronRight, UserPlus, Trash2, Wifi, WifiOff, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Client {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  is_active: boolean;
  creator_name: string | null;
}

interface AssignedPerson {
  id: string;
  assignment_id: string;
  full_name: string;
  role: string;
}

interface AvailablePerson {
  id: string;
  full_name: string;
}

interface ClientDetail {
  client: Client;
  tenantId: string | null;
  instances: { id: string; instance_name: string; display_name: string | null; status: string | null; phone_number: string | null }[];
  gestors: AssignedPerson[];
  csUsers: AssignedPerson[];
}

const Clients = () => {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Assignment
  const [availableGestors, setAvailableGestors] = useState<AvailablePerson[]>([]);
  const [availableCs, setAvailableCs] = useState<AvailablePerson[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

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

  const openDetail = async (client: Client) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);

    try {
      // Get tenant for this client
      const { data: userRole } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", client.id)
        .limit(1)
        .maybeSingle();

      const tenantId = userRole?.tenant_id || null;
      let instances: ClientDetail["instances"] = [];
      let gestors: AssignedPerson[] = [];
      let csUsers: AssignedPerson[] = [];

      if (tenantId) {
        // Fetch instances + assignments in parallel
        const [instRes, assignRes] = await Promise.all([
          supabase.from("whatsapp_instances").select("id, instance_name, display_name, status, phone_number").eq("tenant_id", tenantId),
          supabase.from("tenant_assignments").select("id, manager_id, assigned_at").eq("tenant_id", tenantId),
        ]);

        instances = (instRes.data || []) as any;

        if (assignRes.data && assignRes.data.length > 0) {
          const managerIds = assignRes.data.map(a => a.manager_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, role")
            .in("id", managerIds);

          const profileMap = new Map((profiles || []).map(p => [p.id, p]));

          assignRes.data.forEach(a => {
            const p = profileMap.get(a.manager_id);
            if (!p) return;
            const person: AssignedPerson = {
              id: p.id,
              assignment_id: a.id,
              full_name: p.full_name || "—",
              role: p.role || "",
            };
            if (p.role === "gestor") gestors.push(person);
            else if (p.role === "sucesso_cliente") csUsers.push(person);
            else {
              // gerente or admin goes to gestors section
              gestors.push(person);
            }
          });
        }
      }

      // Load available gestors and CS in parallel
      const [gestorsRes, csRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name").eq("role", "gestor").eq("is_active", true).order("full_name"),
        supabase.from("profiles").select("id, full_name").eq("role", "sucesso_cliente").eq("is_active", true).order("full_name"),
      ]);

      setAvailableGestors((gestorsRes.data || []) as AvailablePerson[]);
      setAvailableCs((csRes.data || []) as AvailablePerson[]);

      setDetail({ client, tenantId, instances, gestors, csUsers });
    } catch (err) {
      console.error("Error loading client detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAssign = async (managerId: string, role: string) => {
    if (!detail?.tenantId) return;
    setAssignLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("tenant_assignments").insert({
        manager_id: managerId,
        tenant_id: detail.tenantId,
        assigned_by: user?.id,
      });

      if (error) {
        if (error.code === "23505") {
          toast.info("Este responsável já está atribuído.");
        } else {
          throw error;
        }
      } else {
        toast.success(`${role === "gestor" ? "Gestor" : "Sucesso do Cliente"} atribuído com sucesso`);
        openDetail(detail.client);
      }
    } catch (err: any) {
      toast.error("Erro ao atribuir: " + (err.message || ""));
    } finally {
      setAssignLoading(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string, name: string) => {
    if (!confirm(`Remover ${name} deste cliente?`)) return;
    try {
      await supabase.from("tenant_assignments").delete().eq("id", assignmentId);
      toast.success("Responsável removido");
      if (detail) openDetail(detail.client);
    } catch (err: any) {
      toast.error("Erro ao remover: " + (err.message || ""));
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const ROLE_LABELS: Record<string, string> = {
    gestor: "Gestor",
    sucesso_cliente: "Sucesso do Cliente",
    gerente: "Gerente",
    admin: "Admin",
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
            <p className="text-sm text-muted-foreground">{total} cliente{total !== 1 ? "s" : ""}</p>
          </div>
          <InviteDialog defaultRole="cliente" />
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><div className="h-5 w-20 bg-muted rounded animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <UserCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">Nenhum cliente encontrado</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client) => (
                    <TableRow key={client.id} className="cursor-pointer hover:bg-accent/50" onClick={() => openDetail(client)}>
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
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Client Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.client.full_name || "Detalhes do Cliente"}</DialogTitle>
            <DialogDescription>{detail?.client.email}</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : detail ? (
            <div className="space-y-5">
              {/* Instances */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Instâncias WhatsApp</h4>
                {detail.instances.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhuma instância configurada.</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.instances.map(inst => (
                      <div key={inst.id} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30">
                        {inst.status === "connected" ? (
                          <Wifi className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <WifiOff className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{inst.display_name || inst.instance_name}</p>
                          {inst.phone_number && <p className="text-xs text-muted-foreground">{inst.phone_number}</p>}
                        </div>
                        <Badge variant={inst.status === "connected" ? "default" : "secondary"} className="text-[10px]">
                          {inst.status === "connected" ? "Conectado" : "Desconectado"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Gestors Section */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Gestor Atribuído</h4>
                {detail.gestors.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum gestor atribuído</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.gestors.map(g => (
                      <div key={g.assignment_id} className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-muted/30">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{g.full_name}</p>
                          <p className="text-xs text-muted-foreground">{ROLE_LABELS[g.role] || g.role}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => handleRemoveAssignment(g.assignment_id, g.full_name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {(() => {
                  const unassigned = availableGestors.filter(g => !detail.gestors.some(a => a.id === g.id));
                  if (unassigned.length === 0 || !detail.tenantId) return null;
                  return (
                    <div className="mt-2 flex items-center gap-2">
                      <Select onValueChange={(v) => handleAssign(v, "gestor")} disabled={assignLoading}>
                        <SelectTrigger className="flex-1 h-8 text-xs">
                          <SelectValue placeholder="Adicionar gestor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {unassigned.map(g => (
                            <SelectItem key={g.id} value={g.id}>{g.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  );
                })()}
              </div>

              {/* CS Section */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Sucesso do Cliente</h4>
                {detail.csUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum CS atribuído</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.csUsers.map(c => (
                      <div key={c.assignment_id} className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-muted/30">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{c.full_name}</p>
                          <p className="text-xs text-muted-foreground">Sucesso do Cliente</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => handleRemoveAssignment(c.assignment_id, c.full_name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {(() => {
                  const unassigned = availableCs.filter(c => !detail.csUsers.some(a => a.id === c.id));
                  if (unassigned.length === 0 || !detail.tenantId) return null;
                  return (
                    <div className="mt-2 flex items-center gap-2">
                      <Select onValueChange={(v) => handleAssign(v, "sucesso_cliente")} disabled={assignLoading}>
                        <SelectTrigger className="flex-1 h-8 text-xs">
                          <SelectValue placeholder="Adicionar CS..." />
                        </SelectTrigger>
                        <SelectContent>
                          {unassigned.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Clients;
