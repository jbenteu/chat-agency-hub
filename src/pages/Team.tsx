import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { InviteDialog } from "@/components/invite/InviteDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Search, UsersRound, UserPlus, Building2, Trash2, CalendarDays, Wifi, WifiOff,
  Mail, Phone,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClientInstance {
  id: string;
  instance_name: string;
  display_name: string | null;
  status: string | null;
  phone_number: string | null;
}

interface AssignedClient {
  tenant_id: string;
  tenant_name: string;
  assignment_id: string;
  assigned_at: string;
  notes: string | null;
  client_profile: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    is_active: boolean;
  } | null;
  instances: ClientInstance[];
}

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  assignedClients: AssignedClient[];
}

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

const ROLE_LABELS: Record<string, string> = {
  gestor: "Gestor",
  sucesso_cliente: "Sucesso do Cliente",
  gerente: "Gerente",
};

const Team = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Assignment dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [allTenants, setAllTenants] = useState<TenantOption[]>([]);
  const [assigning, setAssigning] = useState(false);

  // Detail dialog for a specific member
  const [detailMember, setDetailMember] = useState<TeamMember | null>(null);

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, role: roleFilter, page: "1", limit: "50" });
      const { data, error } = await supabase.functions.invoke("get-team-members?" + params.toString(), {
        method: "GET",
      });

      if (error || !data) {
        setMembers([]);
        return;
      }

      const rawMembers = data.team_members ?? [];
      const memberIds = rawMembers.map((m: any) => m.id);

      if (memberIds.length === 0) {
        setMembers([]);
        return;
      }

      // Fetch all tenant assignments for these members
      const { data: assignments } = await supabase
        .from("tenant_assignments")
        .select("id, manager_id, tenant_id, assigned_at, notes")
        .in("manager_id", memberIds);

      const tenantIds = [...new Set((assignments ?? []).map((a) => a.tenant_id))];

      // Fetch tenant names + client profiles + instances in parallel
      let tenantsMap = new Map<string, { name: string; slug: string }>();
      let clientProfilesMap = new Map<string, { id: string; full_name: string; email: string | null; phone: string | null; is_active: boolean }>();
      let instancesMap = new Map<string, ClientInstance[]>();

      if (tenantIds.length > 0) {
        const [tenantsRes, rolesRes, instancesRes] = await Promise.all([
          supabase.from("tenants").select("id, name, slug").in("id", tenantIds),
          supabase.from("user_roles").select("user_id, tenant_id").in("tenant_id", tenantIds),
          supabase.from("whatsapp_instances").select("id, instance_name, display_name, status, phone_number, tenant_id").in("tenant_id", tenantIds),
        ]);

        (tenantsRes.data ?? []).forEach((t) => tenantsMap.set(t.id, { name: t.name, slug: t.slug }));

        // Group instances by tenant
        (instancesRes.data ?? []).forEach((inst) => {
          const list = instancesMap.get(inst.tenant_id) || [];
          list.push(inst);
          instancesMap.set(inst.tenant_id, list);
        });

        // Get client profiles (users who own each tenant)
        const clientUserIds = [...new Set((rolesRes.data ?? []).map((r) => r.user_id))];
        if (clientUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, email, phone, is_active")
            .in("id", clientUserIds)
            .eq("role", "cliente");

          (profiles ?? []).forEach((p) => clientProfilesMap.set(p.id, {
            id: p.id,
            full_name: p.full_name || "Sem nome",
            email: p.email,
            phone: p.phone,
            is_active: p.is_active ?? true,
          }));
        }

        // Map tenant -> client profile
        const tenantToClient = new Map<string, string>();
        (rolesRes.data ?? []).forEach((r) => {
          if (clientProfilesMap.has(r.user_id)) {
            tenantToClient.set(r.tenant_id, r.user_id);
          }
        });

        // Build enriched members
        const enrichedMembers: TeamMember[] = rawMembers.map((m: any) => {
          const memberAssignments = (assignments ?? []).filter((a) => a.manager_id === m.id);
          const assignedClients: AssignedClient[] = memberAssignments.map((a) => {
            const tenant = tenantsMap.get(a.tenant_id);
            const clientUserId = tenantToClient.get(a.tenant_id);
            const clientProfile = clientUserId ? clientProfilesMap.get(clientUserId) || null : null;
            return {
              tenant_id: a.tenant_id,
              tenant_name: tenant?.name ?? "Desconhecido",
              assignment_id: a.id,
              assigned_at: a.assigned_at,
              notes: a.notes,
              client_profile: clientProfile,
              instances: instancesMap.get(a.tenant_id) ?? [],
            };
          });

          return {
            id: m.id,
            full_name: m.full_name,
            email: m.email,
            avatar_url: m.avatar_url,
            role: m.role,
            is_active: m.is_active,
            created_at: m.created_at,
            assignedClients,
          };
        });

        setMembers(enrichedMembers);
      } else {
        setMembers(rawMembers.map((m: any) => ({ ...m, assignedClients: [] })));
      }
    } catch (e) {
      console.error("Erro ao buscar equipe:", e);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  const loadTenants = useCallback(async () => {
    const { data } = await supabase.from("tenants").select("id, name, slug").order("name");
    setAllTenants(data ?? []);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(fetchTeam, 300);
    return () => clearTimeout(timeout);
  }, [fetchTeam]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const handleAssign = async () => {
    if (!selectedManagerId || !selectedTenantId) return;
    setAssigning(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("tenant_assignments").insert({
        manager_id: selectedManagerId,
        tenant_id: selectedTenantId,
        notes: assignmentNotes || null,
        assigned_by: user?.id,
      });
      if (error) {
        if (error.code === "23505") {
          toast.error("Este cliente já está atribuído a este membro.");
          return;
        }
        throw error;
      }
      toast.success("Cliente atribuído com sucesso");
      setAssignDialogOpen(false);
      setSelectedManagerId("");
      setSelectedTenantId("");
      setAssignmentNotes("");
      fetchTeam();
    } catch (e: any) {
      toast.error("Erro ao atribuir: " + (e.message || ""));
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string, tenantName: string) => {
    if (!confirm(`Remover atribuição de "${tenantName}"?`)) return;
    try {
      await supabase.from("tenant_assignments").delete().eq("id", assignmentId);
      toast.success("Atribuição removida");
      fetchTeam();
    } catch (e: any) {
      toast.error("Erro ao remover: " + (e.message || ""));
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const managerOptions = members.filter((m) => ["gestor", "sucesso_cliente", "gerente"].includes(m.role));

  const renderMembers = (filterRole?: string) => {
    const filtered = filterRole ? members.filter((m) => m.role === filterRole) : members;

    if (loading) {
      return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <UsersRound className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum membro encontrado</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((member) => (
          <Card
            key={member.id}
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => setDetailMember(member)}
          >
            <CardContent className="p-5 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={member.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xs">{getInitials(member.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{member.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                </div>
              </div>

              {/* Role + client count */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">
                  {ROLE_LABELS[member.role] ?? member.role}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  <Building2 className="mr-1 h-3 w-3" />
                  {member.assignedClients.length} cliente{member.assignedClients.length !== 1 ? "s" : ""}
                </Badge>
              </div>

              {/* Preview of assigned clients (max 3) */}
              {member.assignedClients.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {member.assignedClients.slice(0, 3).map((ac) => (
                    <div key={ac.assignment_id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{ac.client_profile?.full_name ?? ac.tenant_name}</span>
                      {ac.instances.some((i) => i.status === "connected") ? (
                        <Wifi className="h-3 w-3 text-emerald-500 shrink-0 ml-auto" />
                      ) : ac.instances.length > 0 ? (
                        <WifiOff className="h-3 w-3 text-muted-foreground shrink-0 ml-auto" />
                      ) : null}
                    </div>
                  ))}
                  {member.assignedClients.length > 3 && (
                    <p className="text-[11px] text-muted-foreground/60">+{member.assignedClients.length - 3} mais</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Equipe</h1>
            <p className="text-sm text-muted-foreground">Gestores e Sucesso do Cliente</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAssignDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Atribuir Cliente
            </Button>
            <InviteDialog />
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <Tabs defaultValue="all" onValueChange={setRoleFilter}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="gerente">Gerentes</TabsTrigger>
            <TabsTrigger value="gestor">Gestores</TabsTrigger>
            <TabsTrigger value="sucesso_cliente">Sucesso do Cliente</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-4">{renderMembers()}</TabsContent>
          <TabsContent value="gerente" className="mt-4">{renderMembers("gerente")}</TabsContent>
          <TabsContent value="gestor" className="mt-4">{renderMembers("gestor")}</TabsContent>
          <TabsContent value="sucesso_cliente" className="mt-4">{renderMembers("sucesso_cliente")}</TabsContent>
        </Tabs>
      </div>

      {/* Member detail dialog */}
      <Dialog open={!!detailMember} onOpenChange={(open) => !open && setDetailMember(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detailMember && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={detailMember.avatar_url ?? undefined} />
                    <AvatarFallback className="text-xs">{getInitials(detailMember.full_name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p>{detailMember.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]">{ROLE_LABELS[detailMember.role] ?? detailMember.role}</Badge>
                    </div>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                {detailMember.email && (
                  <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{detailMember.email}</span>
                )}
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-semibold mb-3">Clientes Atribuídos ({detailMember.assignedClients.length})</h4>
                {detailMember.assignedClients.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum cliente atribuído</p>
                ) : (
                  <div className="space-y-3">
                    {detailMember.assignedClients.map((ac) => (
                      <div key={ac.assignment_id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {ac.client_profile?.full_name ?? ac.tenant_name}
                            </p>
                            {ac.client_profile?.email && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />{ac.client_profile.email}
                              </p>
                            )}
                            {ac.client_profile?.phone && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />{ac.client_profile.phone}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive shrink-0"
                            onClick={() => handleRemoveAssignment(ac.assignment_id, ac.client_profile?.full_name ?? ac.tenant_name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Instances */}
                        {ac.instances.length > 0 && (
                          <div className="space-y-1">
                            {ac.instances.map((inst) => (
                              <div key={inst.id} className="flex items-center gap-2 text-xs rounded-md bg-muted/50 p-1.5">
                                {inst.status === "connected" ? (
                                  <Wifi className="h-3 w-3 text-emerald-500 shrink-0" />
                                ) : (
                                  <WifiOff className="h-3 w-3 text-muted-foreground shrink-0" />
                                )}
                                <span className="truncate">{inst.display_name || inst.phone_number || inst.instance_name}</span>
                                <Badge variant="outline" className="text-[9px] ml-auto shrink-0">
                                  {inst.status === "connected" ? "Conectado" : "Desconectado"}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <CalendarDays className="h-3 w-3" />
                          <span>Atribuído em {format(new Date(ac.assigned_at), "dd MMM yyyy", { locale: ptBR })}</span>
                        </div>
                        {ac.notes && <p className="text-[11px] text-muted-foreground/80 italic">{ac.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Assignment Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Membro da Equipe</Label>
              <Select value={selectedManagerId} onValueChange={setSelectedManagerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um membro..." />
                </SelectTrigger>
                <SelectContent>
                  {managerOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name} ({ROLE_LABELS[m.role] ?? m.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cliente (Tenant)</Label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {allTenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea
                placeholder="Ex: Cliente prioritário..."
                value={assignmentNotes}
                onChange={(e) => setAssignmentNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAssign} disabled={!selectedManagerId || !selectedTenantId || assigning}>
              {assigning ? "Atribuindo..." : "Atribuir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Team;
