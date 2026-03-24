import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { InviteDialog } from "@/components/invite/InviteDialog";
import { ClientDetailDialog } from "@/components/team/ClientDetailDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Search, UsersRound, MessageCircle, Users, ChevronDown, ChevronRight,
  Phone, Mail, Wifi, WifiOff, UserPlus, Building2, Trash2, CalendarDays,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClientInstance {
  id: string;
  instance_name: string;
  display_name: string | null;
  status: string;
  phone_number: string | null;
}

interface Client {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  tenant_id?: string | null;
  whatsapp_instances: ClientInstance[];
}

interface TenantAssignment {
  id: string;
  manager_id: string;
  tenant_id: string;
  assigned_at: string;
  notes: string | null;
  tenant_name: string;
  tenant_slug: string;
}

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  client_count: number;
  clients: Client[];
  whatsapp_instance: {
    id: string;
    instance_name: string;
    status: string;
  } | null;
  assigned_tenants: TenantAssignment[];
}

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

const ROLE_LABELS: Record<string, string> = {
  gestor: "Gestor",
  sucesso_cliente: "Sucesso do Cliente",
};

const Team = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);

  // Assignment dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [allTenants, setAllTenants] = useState<TenantOption[]>([]);
  const [assigning, setAssigning] = useState(false);

  const { toast } = useToast();

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, role: roleFilter, page: "1", limit: "50" });
      const { data, error } = await supabase.functions.invoke("get-team-members?" + params.toString(), {
        method: "GET",
      });

      if (!error && data) {
        const teamMembers: TeamMember[] = (data.team_members ?? []).map((m: any) => ({
          ...m,
          assigned_tenants: [],
        }));

        // Fetch tenant assignments for all members
        const memberIds = teamMembers.map((m) => m.id);
        if (memberIds.length > 0) {
          const { data: assignments } = await supabase
            .from("tenant_assignments")
            .select("id, manager_id, tenant_id, assigned_at, notes")
            .in("manager_id", memberIds);

          if (assignments && assignments.length > 0) {
            const tenantIds = [...new Set(assignments.map((a) => a.tenant_id))];
            const { data: tenants } = await supabase
              .from("tenants")
              .select("id, name, slug")
              .in("id", tenantIds);

            const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t]));

            for (const member of teamMembers) {
              member.assigned_tenants = assignments
                .filter((a) => a.manager_id === member.id)
                .map((a) => {
                  const tenant = tenantMap.get(a.tenant_id);
                  return {
                    id: a.id,
                    manager_id: a.manager_id,
                    tenant_id: a.tenant_id,
                    assigned_at: a.assigned_at,
                    notes: a.notes,
                    tenant_name: tenant?.name ?? "Desconhecido",
                    tenant_slug: tenant?.slug ?? "",
                  };
                });
            }
          }
        }

        setMembers(teamMembers);
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

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const toggleExpanded = (memberId: string) => {
    setExpandedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const handleClientClick = (client: Client) => {
    setSelectedClient(client);
    setClientDialogOpen(true);
  };

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
          toast({ title: "Atribuição já existe", description: "Este cliente já está atribuído a este gestor.", variant: "destructive" });
          return;
        }
        throw error;
      }

      toast({ title: "Cliente atribuído com sucesso" });
      setAssignDialogOpen(false);
      setSelectedManagerId("");
      setSelectedTenantId("");
      setAssignmentNotes("");
      fetchTeam();
    } catch (e: any) {
      toast({ title: "Erro ao atribuir", description: e.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string, managerName: string, tenantName: string) => {
    if (!confirm(`Remover ${tenantName} de ${managerName}?`)) return;
    try {
      await supabase.from("tenant_assignments").delete().eq("id", assignmentId);
      toast({ title: "Atribuição removida" });
      fetchTeam();
    } catch (e: any) {
      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" });
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const managerOptions = members.filter((m) => ["gestor", "sucesso_cliente", "gerente"].includes(m.role));

  const renderMembers = (filterRole?: string) => {
    const filtered = filterRole ? members.filter((m) => m.role === filterRole) : members;

    if (loading) {
      return Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ));
    }

    if (filtered.length === 0) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UsersRound className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum membro encontrado</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {filtered.map((member) => {
          const isExpanded = expandedMembers.has(member.id);
          const tenantCount = member.assigned_tenants.length;
          return (
            <Card key={member.id} className="overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.avatar_url ?? undefined} />
                    <AvatarFallback className="text-xs">{getInitials(member.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{member.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {ROLE_LABELS[member.role] ?? member.role}
                      </Badge>
                      {tenantCount > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          <Building2 className="mr-1 h-3 w-3" />
                          {tenantCount} cliente{tenantCount !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    <span>{member.client_count} cliente{member.client_count !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {member.whatsapp_instance ? (
                      <span className={member.whatsapp_instance.status === "connected" ? "text-emerald-500" : "text-amber-500"}>
                        {member.whatsapp_instance.status === "connected" ? "Conectado" : "Desconectado"}
                      </span>
                    ) : (
                      <span>Sem instância pessoal</span>
                    )}
                  </div>
                </div>

                {/* Tenant Assignments Section */}
                {tenantCount > 0 && (
                  <>
                    <Separator className="my-3" />
                    <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(member.id)}>
                      <CollapsibleTrigger className="flex w-full items-center gap-1 text-xs font-medium text-primary hover:underline">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        Clientes atribuídos ({tenantCount})
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-3 space-y-2">
                          {member.assigned_tenants.map((assignment) => (
                            <div
                              key={assignment.id}
                              className="rounded-lg border border-border/60 bg-muted/50 p-3 hover:bg-muted/80 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{assignment.tenant_name}</p>
                                    <p className="text-[11px] text-muted-foreground">@{assignment.tenant_slug}</p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                                  onClick={() => handleRemoveAssignment(assignment.id, member.full_name, assignment.tenant_name)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                                <CalendarDays className="h-3 w-3" />
                                <span>Atribuído em {format(new Date(assignment.assigned_at), "dd MMM yyyy", { locale: ptBR })}</span>
                              </div>
                              {assignment.notes && (
                                <p className="mt-1 text-[11px] text-muted-foreground/80 italic">{assignment.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </>
                )}

                {/* Expandable client details (user_relationships) */}
                {member.clients && member.clients.length > 0 && (
                  <Collapsible>
                    <CollapsibleTrigger className="mt-3 flex w-full items-center gap-1 text-xs font-medium text-primary hover:underline">
                      <ChevronRight className="h-3.5 w-3.5" />
                      Ver clientes vinculados ({member.clients.length})
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        {member.clients.map((client) => (
                          <div
                            key={client.id}
                            className="rounded-lg border border-border/60 bg-muted/30 p-3 cursor-pointer hover:bg-muted/60 transition-colors"
                            onClick={() => handleClientClick(client)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{client.full_name}</p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                                  {client.email && (
                                    <span className="flex items-center gap-1">
                                      <Mail className="h-3 w-3" />
                                      {client.email}
                                    </span>
                                  )}
                                  {client.phone && (
                                    <span className="flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {client.phone}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Badge variant={client.is_active ? "default" : "secondary"} className="shrink-0 text-[9px]">
                                {client.is_active ? "Ativo" : "Inativo"}
                              </Badge>
                            </div>
                            {client.whatsapp_instances.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {client.whatsapp_instances.map((inst) => (
                                  <div key={inst.id} className="flex items-center gap-2 text-[11px]">
                                    {inst.status === "connected" ? (
                                      <Wifi className="h-3 w-3 text-emerald-500" />
                                    ) : (
                                      <WifiOff className="h-3 w-3 text-muted-foreground" />
                                    )}
                                    <span className="truncate text-muted-foreground">
                                      {inst.display_name || inst.phone_number || inst.instance_name}
                                    </span>
                                    <Badge variant="outline" className="text-[9px] ml-auto shrink-0">
                                      {inst.status === "connected" ? "Conectado" : "Desconectado"}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            )}
                            {client.whatsapp_instances.length === 0 && (
                              <p className="mt-1.5 text-[11px] text-muted-foreground/60 italic">Sem instância WhatsApp</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </CardContent>
            </Card>
          );
        })}
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
          <Input
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs defaultValue="all" onValueChange={setRoleFilter}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="gestor">Gestores</TabsTrigger>
            <TabsTrigger value="sucesso_cliente">Sucesso do Cliente</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-4">{renderMembers()}</TabsContent>
          <TabsContent value="gestor" className="mt-4">{renderMembers("gestor")}</TabsContent>
          <TabsContent value="sucesso_cliente" className="mt-4">{renderMembers("sucesso_cliente")}</TabsContent>
        </Tabs>
      </div>

      <ClientDetailDialog
        client={selectedClient}
        open={clientDialogOpen}
        onOpenChange={setClientDialogOpen}
        onUpdated={fetchTeam}
      />

      {/* Assignment Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Cliente ao Gestor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Gestor</Label>
              <Select value={selectedManagerId} onValueChange={setSelectedManagerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um gestor..." />
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
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} (@{t.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea
                placeholder="Ex: Cliente prioritário, contato direto..."
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
