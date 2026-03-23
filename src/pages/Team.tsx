import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { InviteDialog } from "@/components/invite/InviteDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, UsersRound, MessageCircle, Users, ChevronDown, ChevronRight, Phone, Mail, Wifi, WifiOff } from "lucide-react";

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
  whatsapp_instances: ClientInstance[];
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

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, role: roleFilter, page: "1", limit: "50" });
      const { data, error } = await supabase.functions.invoke("get-team-members?" + params.toString(), {
        method: "GET",
      });

      if (!error && data) {
        setMembers(data.team_members ?? []);
      }
    } catch (e) {
      console.error("Erro ao buscar equipe:", e);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    const timeout = setTimeout(fetchTeam, 300);
    return () => clearTimeout(timeout);
  }, [fetchTeam]);

  const toggleExpanded = (memberId: string) => {
    setExpandedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

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
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {ROLE_LABELS[member.role] ?? member.role}
                    </Badge>
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
                      <span className={member.whatsapp_instance.status === "connected" ? "text-green-500" : "text-amber-500"}>
                        {member.whatsapp_instance.status === "connected" ? "Conectado" : "Desconectado"}
                      </span>
                    ) : (
                      <span>Sem instância pessoal</span>
                    )}
                  </div>
                </div>

                {/* Expandable client details */}
                {member.clients && member.clients.length > 0 && (
                  <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(member.id)}>
                    <CollapsibleTrigger className="mt-3 flex w-full items-center gap-1 text-xs font-medium text-primary hover:underline">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      Ver clientes atribuídos ({member.clients.length})
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        {member.clients.map((client) => (
                          <div key={client.id} className="rounded-lg border border-border/60 bg-muted/30 p-3">
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
                            {/* Client WhatsApp instances */}
                            {client.whatsapp_instances.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {client.whatsapp_instances.map((inst) => (
                                  <div key={inst.id} className="flex items-center gap-2 text-[11px]">
                                    {inst.status === "connected" ? (
                                      <Wifi className="h-3 w-3 text-green-500" />
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
          <InviteDialog />
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
    </AppLayout>
  );
};

export default Team;
