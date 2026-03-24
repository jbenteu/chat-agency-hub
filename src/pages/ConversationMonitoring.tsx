import React, { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  MessageCircle, RefreshCw, Building2, ChevronRight, ChevronDown,
  Wifi, WifiOff, ArrowLeft, Loader2,
} from "lucide-react";

interface TenantClient {
  id: string;
  name: string;
  slug: string;
}

interface InstanceInfo {
  id: string;
  instance_name: string;
  display_name: string | null;
  status: string | null;
  phone_number: string | null;
  tenant_id: string;
}

interface ConversationItem {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number | null;
  profile_picture_url: string | null;
  remote_jid: string;
}

type View = "clients" | "instances" | "conversations";

const formatRelativeTime = (dateString: string | null): string => {
  if (!dateString) return "—";
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 60) return `${Math.max(1, minutes)}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d atrás`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

const getInitials = (name: string | null): string => {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
};

const ConversationMonitoring: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("clients");
  
  // Data
  const [clients, setClients] = useState<TenantClient[]>([]);
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  
  // Selection
  const [selectedClient, setSelectedClient] = useState<TenantClient | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<InstanceInfo | null>(null);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if admin
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "super_admin"] as any[]);
      const isAdmin = !!(roles && roles.length > 0);

      if (isAdmin) {
        // Admins see all tenants
        const { data: tenants } = await supabase
          .from("tenants")
          .select("id, name, slug")
          .order("name");
        setClients((tenants || []) as TenantClient[]);
      } else {
        // Managers see assigned tenants
        const { data: assignments } = await supabase
          .from("tenant_assignments")
          .select("tenant_id, tenants(id, name, slug)")
          .eq("manager_id", user.id);
        
        const tenants = (assignments || [])
          .map((a: any) => a.tenants as TenantClient)
          .filter(Boolean);
        setClients(tenants);
      }
    } catch (err) {
      console.error("Error loading clients:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInstances = useCallback(async (tenantId: string) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("id, instance_name, display_name, status, phone_number, tenant_id")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      setInstances((data || []) as InstanceInfo[]);
    } catch (err) {
      console.error("Error loading instances:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConversations = useCallback(async (instanceId: string) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("whatsapp_conversations")
        .select("id, contact_name, contact_phone, last_message, last_message_at, unread_count, profile_picture_url, remote_jid")
        .eq("instance_id", instanceId)
        .order("last_message_at", { ascending: false })
        .limit(200);
      setConversations((data || []) as ConversationItem[]);
    } catch (err) {
      console.error("Error loading conversations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  const handleSelectClient = (client: TenantClient) => {
    setSelectedClient(client);
    setView("instances");
    loadInstances(client.id);
  };

  const handleSelectInstance = (instance: InstanceInfo) => {
    setSelectedInstance(instance);
    setView("conversations");
    loadConversations(instance.id);
  };

  const handleBack = () => {
    if (view === "conversations") {
      setView("instances");
      setSelectedInstance(null);
      if (selectedClient) loadInstances(selectedClient.id);
    } else if (view === "instances") {
      setView("clients");
      setSelectedClient(null);
    }
  };

  const handleRefresh = () => {
    if (view === "clients") loadClients();
    else if (view === "instances" && selectedClient) loadInstances(selectedClient.id);
    else if (view === "conversations" && selectedInstance) loadConversations(selectedInstance.id);
  };

  // Breadcrumb
  const breadcrumb = () => {
    const parts: string[] = ["Clientes"];
    if (selectedClient) parts.push(selectedClient.name);
    if (selectedInstance) parts.push(selectedInstance.display_name || selectedInstance.instance_name);
    return parts;
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {view !== "clients" && (
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold">Monitoramento</h1>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                {breadcrumb().map((part, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <ChevronRight className="h-3 w-3" />}
                    <span>{part}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <Separator />

        {/* Content */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-3 p-4">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-[50%]" />
                    <Skeleton className="h-3 w-[30%]" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : view === "clients" ? (
          /* CLIENTS LIST */
          clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Building2 className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg font-medium">Nenhum cliente atribuído</p>
              <p className="text-sm">Solicite ao administrador para atribuir clientes a você.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {clients.map(client => (
                <Card
                  key={client.id}
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                  onClick={() => handleSelectClient(client)}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{client.name}</p>
                      <p className="text-xs text-muted-foreground">@{client.slug}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : view === "instances" ? (
          /* INSTANCES LIST */
          instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <WifiOff className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg font-medium">Nenhuma instância encontrada</p>
              <p className="text-sm">Este cliente não possui instâncias de WhatsApp configuradas.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {instances.map(inst => (
                <Card
                  key={inst.id}
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                  onClick={() => handleSelectInstance(inst)}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      inst.status === "open" ? "bg-green-500/10" : "bg-muted"
                    }`}>
                      {inst.status === "open" ? (
                        <Wifi className="h-5 w-5 text-green-500" />
                      ) : (
                        <WifiOff className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{inst.display_name || inst.instance_name}</p>
                      {inst.phone_number && (
                        <p className="text-xs text-muted-foreground">{inst.phone_number}</p>
                      )}
                      <Badge variant={inst.status === "open" ? "default" : "secondary"} className="mt-1 text-[10px] h-5">
                        {inst.status === "open" ? "Conectado" : "Desconectado"}
                      </Badge>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : (
          /* CONVERSATIONS LIST */
          conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg font-medium">Nenhuma conversa encontrada</p>
              <p className="text-sm">Esta instância ainda não possui conversas.</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-220px)]">
              <div className="space-y-1.5 pr-3">
                {conversations.map(conv => (
                  <Card key={conv.id} className="transition-colors hover:bg-accent/50">
                    <CardContent className="flex items-start gap-3 p-3">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={conv.profile_picture_url || undefined} />
                        <AvatarFallback className="text-xs">{getInitials(conv.contact_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">
                            {conv.contact_name || conv.contact_phone || conv.remote_jid?.split("@")[0] || "Desconhecido"}
                          </p>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-xs text-muted-foreground">{formatRelativeTime(conv.last_message_at)}</span>
                            {(conv.unread_count ?? 0) > 0 && (
                              <Badge variant="destructive" className="text-[10px] h-5 min-w-[20px] justify-center">
                                {conv.unread_count}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {conv.last_message && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{conv.last_message}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )
        )}
      </div>
    </AppLayout>
  );
};

export default ConversationMonitoring;
