import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { useEvolutionApi } from "@/hooks/use-evolution-api";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { MediaMessage } from "@/components/whatsapp/MediaMessage";
import { WhatsAppFormatted } from "@/components/whatsapp/WhatsAppFormatted";
import { DateSeparator } from "@/components/whatsapp/DateSeparator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Eye, RefreshCw, Search, MessageCircle, Loader2, Wifi, WifiOff,
  ChevronUp, AlertTriangle, Lock, PanelLeftClose, PanelLeft, Users, Building2,
} from "lucide-react";

interface MonitoringInstance {
  id: string;
  display_name: string | null;
  instance_name: string;
  phone_number: string | null;
  status: string;
  assigned_to: string | null;
  owner_name: string | null;
  tenant_id: string;
  tenant_name: string;
}

interface MonitoringConversation {
  id: string;
  tenant_id: string;
  instance_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number | null;
  profile_picture_url: string | null;
  remote_jid: string;
  instance_display_name: string;
  instance_name_raw: string;
  instance_phone: string;
  instance_status: string;
  instance_owner_name: string | null;
  tenant_name: string;
}

interface MonitoringMessage {
  id: string;
  content: string | null;
  direction: string;
  created_at: string;
  media_url: string | null;
  media_type: string | null;
  media_mime_type: string | null;
  media_thumbnail: string | null;
  media_width: number | null;
  media_height: number | null;
  message_id: string | null;
  metadata: Record<string, unknown> | null;
  status: string | null;
}

const formatRelativeTime = (dateString: string | null): string => {
  if (!dateString) return "—";
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

const getInitials = (name: string | null): string => {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
};

const getInitialColor = (name: string | null): string => {
  const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-teal-500"];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const shouldShowDateSeparator = (currentMsg: MonitoringMessage, prevMsg: MonitoringMessage | null): boolean => {
  if (!prevMsg) return true;
  const currDate = new Date(currentMsg.created_at).toDateString();
  const prevDate = new Date(prevMsg.created_at).toDateString();
  return currDate !== prevDate;
};

const formatMessageContent = (content: string | null): string => {
  if (!content) return "";
  // Handle quoted messages
  const quotedMatch = content.match(/^\[Respondendo:.*?\]\s*/);
  if (quotedMatch) return content.slice(quotedMatch[0].length) || "[Resposta]";
  return content;
};

const Monitoring: React.FC = () => {
  const { profile, isSuperAdmin } = useAuth();
  const { monitoringConversations } = useEvolutionApi();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [instances, setInstances] = useState<MonitoringInstance[]>([]);
  const [conversations, setConversations] = useState<MonitoringConversation[]>([]);
  const [messages, setMessages] = useState<MonitoringMessage[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<MonitoringConversation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Filter states
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("all");
  const [selectedClientId, setSelectedClientId] = useState<string>("all");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check access
  useEffect(() => {
    if (!profile?.id) return;
    if (isSuperAdmin || profile.role === "admin" || profile.role === "gerente" || profile.role === "gestor" || profile.role === "sucesso_cliente") {
      setHasAccess(true);
    } else {
      setHasAccess(false);
    }
  }, [profile, isSuperAdmin]);

  useEffect(() => {
    if (hasAccess === false) {
      toast({ title: "Acesso negado", description: "Apenas gestores podem acessar o monitoramento.", variant: "destructive" });
      navigate("/", { replace: true });
    }
  }, [hasAccess, navigate, toast]);

  // All tenants (unfiltered)
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  // Tenant IDs assigned to the selected team member
  const [memberTenantIds, setMemberTenantIds] = useState<string[]>([]);

  // Load team members and all clients
  useEffect(() => {
    if (!hasAccess) return;
    const loadFilters = async () => {
      try {
        // Load team members (gestors/CS) visible to this user
        const { data: relationships } = await supabase
          .from("user_relationships")
          .select("subordinate_id, profiles!user_relationships_subordinate_id_fkey(id, full_name, role)")
          .eq("superior_id", profile?.id || "");

        const members: { id: string; name: string; role: string }[] = [];
        for (const rel of relationships || []) {
          const p = rel.profiles as any;
          if (p && (p.role === "gestor" || p.role === "sucesso_cliente")) {
            members.push({ id: p.id, name: p.full_name || "Sem nome", role: p.role });
          }
        }

        // For admins, also load all gestors/CS
        if (isSuperAdmin || profile?.role === "admin" || profile?.role === "gerente") {
          const { data: allProfiles } = await supabase
            .from("profiles")
            .select("id, full_name, role")
            .in("role", ["gestor", "sucesso_cliente"]);
          for (const p of allProfiles || []) {
            if (!members.find(m => m.id === p.id)) {
              members.push({ id: p.id, name: p.full_name || "Sem nome", role: p.role || "" });
            }
          }
        }
        setTeamMembers(members);

        // Load accessible tenants based on role
        let tenantList: { id: string; name: string }[] = [];
        if (isSuperAdmin || profile?.role === "admin" || profile?.role === "gerente") {
          const { data: tenants } = await supabase
            .from("tenants")
            .select("id, name")
            .order("name");
          tenantList = (tenants || []).map(t => ({ id: t.id, name: t.name }));
        } else {
          // Gestors/CS only see their assigned tenants
          const { data: assignments } = await supabase
            .from("tenant_assignments")
            .select("tenant_id, tenants(id, name)")
            .eq("manager_id", profile?.id || "");
          tenantList = (assignments || [])
            .map((a: any) => a.tenants as { id: string; name: string })
            .filter(Boolean);
          tenantList.sort((a, b) => a.name.localeCompare(b.name));
        }
        setAllClients(tenantList);
        setClients(tenantList);
      } catch (err) {
        console.error("Error loading filters:", err);
      }
    };
    loadFilters();
  }, [hasAccess, profile, isSuperAdmin]);

  // When a team member is selected, load their assigned tenants and filter client list
  useEffect(() => {
    if (selectedMemberId === "all") {
      setClients(allClients);
      setMemberTenantIds([]);
      return;
    }
    const loadMemberTenants = async () => {
      try {
        const { data: assignments } = await supabase
          .from("tenant_assignments")
          .select("tenant_id")
          .eq("manager_id", selectedMemberId);
        const tenantIds = (assignments || []).map(a => a.tenant_id);
        setMemberTenantIds(tenantIds);
        setClients(allClients.filter(c => tenantIds.includes(c.id)));
        // Reset client selection if current selection is not in filtered list
        if (selectedClientId !== "all" && !tenantIds.includes(selectedClientId)) {
          setSelectedClientId("all");
        }
      } catch (err) {
        console.error("Error loading member tenants:", err);
      }
    };
    loadMemberTenants();
  }, [selectedMemberId, allClients]);

  const loadData = useCallback(async (silent = false) => {
    if (!hasAccess) return;
    if (!silent) setLoading(true);
    try {
      const result = await monitoringConversations({
        instanceId: selectedInstanceId || undefined,
        search: searchQuery || undefined,
        tenantId: selectedClientId !== "all" ? selectedClientId : undefined,
        limit: 100,
      });
      if (result?.conversations) setConversations(result.conversations);
      if (result?.instances) setInstances(result.instances);
    } catch (err: any) {
      if (!silent) toast({ title: "Erro ao carregar conversas", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [hasAccess, monitoringConversations, selectedInstanceId, searchQuery, selectedClientId, toast]);

  useEffect(() => {
    if (hasAccess) loadData();
  }, [hasAccess, selectedInstanceId, selectedClientId]);

  // Polling every 30s
  useEffect(() => {
    if (!hasAccess) return;
    pollingRef.current = setInterval(() => loadData(true), 30000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [hasAccess, loadData]);

  // Search debounce
  useEffect(() => {
    if (!hasAccess) return;
    const timer = setTimeout(() => loadData(), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadMessages = useCallback(async (conv: MonitoringConversation) => {
    setLoadingMessages(true);
    setMessages([]);
    try {
      const { data: msgs, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const sorted = (msgs || []).reverse();
      setMessages(sorted as MonitoringMessage[]);
      setHasMoreMessages((msgs?.length || 0) >= 50);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err: any) {
      toast({ title: "Erro ao carregar mensagens", description: err.message, variant: "destructive" });
    } finally {
      setLoadingMessages(false);
    }
  }, [toast]);

  const loadMoreMessages = useCallback(async () => {
    if (!selectedConversation || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0];
      const { data: msgs, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", selectedConversation.id)
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const sorted = (msgs || []).reverse();
      setMessages(prev => [...sorted as MonitoringMessage[], ...prev]);
      setHasMoreMessages((msgs?.length || 0) >= 50);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  }, [selectedConversation, loadingMore, messages, toast]);

  const handleSelectConversation = (conv: MonitoringConversation) => {
    setSelectedConversation(conv);
    loadMessages(conv);
  };

  // Filter instances by selected team member's assigned tenants
  const filteredInstances = instances.filter(inst => {
    if (selectedMemberId === "all") return true;
    if (memberTenantIds.length === 0) return false;
    return memberTenantIds.includes(inst.tenant_id);
  });

  // Compute unread totals
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  const instanceUnreads: Record<string, number> = {};
  for (const c of conversations) {
    instanceUnreads[c.instance_id] = (instanceUnreads[c.instance_id] || 0) + (c.unread_count || 0);
  }

  if (hasAccess === null) return <AppLayout><div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-5rem)] -m-6 overflow-hidden">
        {/* Column 1 — Sidebar (toggle) */}
        {sidebarOpen && (
          <div className="w-64 border-r border-border flex flex-col bg-muted/30">
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Monitoramento</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => loadData()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSidebarOpen(false)}>
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 space-y-3">
                {/* Team member filter — hidden for gestor/sucesso_cliente */}
                {profile?.role !== "gestor" && profile?.role !== "sucesso_cliente" && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" /> Equipe
                  </label>
                  <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {teamMembers.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          <span>{m.name}</span>
                          <span className="text-muted-foreground ml-1">
                            ({m.role === "gestor" ? "Gestor" : "CS"})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                )}

                {/* Client filter */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> Cliente
                  </label>
                  <Select value={selectedClientId} onValueChange={(val) => {
                    setSelectedClientId(val);
                    setSelectedInstanceId(null);
                  }}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Todos os clientes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os clientes</SelectItem>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Instance list */}
                <div className="space-y-0.5">
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Conexões</label>
                  
                  <button
                    onClick={() => setSelectedInstanceId(null)}
                    className={`w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${!selectedInstanceId ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"}`}
                  >
                    <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 truncate">Todas</span>
                    {totalUnread > 0 && (
                      <Badge variant="destructive" className="h-4 min-w-[16px] px-1 text-[9px]">
                        {totalUnread > 99 ? "99+" : totalUnread}
                      </Badge>
                    )}
                  </button>

                  {filteredInstances.map(inst => {
                    const isConnected = inst.status === "open" || inst.status === "connected";
                    const unread = instanceUnreads[inst.id] || 0;
                    return (
                      <button
                        key={inst.id}
                        onClick={() => setSelectedInstanceId(inst.id)}
                        className={`w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${selectedInstanceId === inst.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"}`}
                      >
                        {isConnected ? (
                          <Wifi className="h-3 w-3 shrink-0 text-green-500" />
                        ) : (
                          <WifiOff className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs truncate">{inst.display_name || inst.phone_number || inst.instance_name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{inst.tenant_name}</div>
                        </div>
                        {unread > 0 && (
                          <Badge variant="destructive" className="h-4 min-w-[16px] px-1 text-[9px]">
                            {unread > 99 ? "99+" : unread}
                          </Badge>
                        )}
                      </button>
                    );
                  })}

                  {filteredInstances.length === 0 && !loading && (
                    <div className="text-[11px] text-muted-foreground text-center py-3">Nenhuma conexão</div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Sidebar toggle when closed */}
        {!sidebarOpen && (
          <div className="border-r border-border flex flex-col items-center py-3 px-1 bg-muted/30">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSidebarOpen(true)}>
              <PanelLeft className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Column 2 — Conversation List */}
        <div className="w-80 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                className="pl-9 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px]">
              <Lock className="h-3 w-3 mr-1" />
              Visualização somente leitura
            </Badge>
          </div>

          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-3 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <MessageCircle className="h-10 w-10 mb-2" />
                <p className="text-sm">Nenhuma conversa encontrada</p>
              </div>
            ) : (
              <div>
                {conversations.map(conv => {
                  const isSelected = selectedConversation?.id === conv.id;
                  const displayName = conv.contact_name || conv.contact_phone || conv.remote_jid.split("@")[0];
                  return (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv)}
                      className={`w-full flex items-start gap-3 px-3 py-3 text-left border-b border-border transition-colors ${isSelected ? "bg-accent" : "hover:bg-accent/50"}`}
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        {conv.profile_picture_url && <AvatarImage src={conv.profile_picture_url} />}
                        <AvatarFallback className={`text-white text-xs ${getInitialColor(displayName)}`}>
                          {getInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate">{displayName}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                            {formatRelativeTime(conv.last_message_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 shrink-0">
                            {conv.instance_display_name}
                          </Badge>
                          {(conv.unread_count || 0) > 0 && (
                            <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 ml-auto shrink-0">
                              {conv.unread_count! > 99 ? "99+" : conv.unread_count}
                            </Badge>
                          )}
                        </div>
                        {conv.last_message && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {formatMessageContent(conv.last_message)}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Column 3 — Message Viewer */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Header */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  {selectedConversation.profile_picture_url && (
                    <AvatarImage src={selectedConversation.profile_picture_url} />
                  )}
                  <AvatarFallback className={`text-white text-xs ${getInitialColor(selectedConversation.contact_name)}`}>
                    {getInitials(selectedConversation.contact_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {selectedConversation.contact_name || selectedConversation.contact_phone || selectedConversation.remote_jid.split("@")[0]}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {selectedConversation.instance_display_name}
                    {selectedConversation.instance_owner_name && ` • ${selectedConversation.instance_owner_name}`}
                    {selectedConversation.tenant_name && ` • ${selectedConversation.tenant_name}`}
                  </div>
                </div>
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px] shrink-0">
                  <Lock className="h-3 w-3 mr-1" />
                  Somente Leitura
                </Badge>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1">
                <div className="px-4 py-3 space-y-1 min-h-full">
                  {hasMoreMessages && (
                    <div className="flex justify-center py-2">
                      <Button variant="ghost" size="sm" onClick={loadMoreMessages} disabled={loadingMore}>
                        {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ChevronUp className="h-4 w-4 mr-1" />}
                        Carregar anteriores
                      </Button>
                    </div>
                  )}

                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                      Nenhuma mensagem encontrada
                    </div>
                  ) : (
                    messages.map((msg, idx) => {
                      const isOutbound = msg.direction === "outbound";
                      const prevMsg = idx > 0 ? messages[idx - 1] : null;
                      const showDate = shouldShowDateSeparator(msg, prevMsg);
                      const time = new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

                      // Extract quoted context
                      const metadata = msg.metadata as Record<string, any> | null;
                      const quotedContent = metadata?.quotedMessage?.conversation || metadata?.quotedMessage?.extendedTextMessage?.text || null;

                      return (
                        <React.Fragment key={msg.id}>
                          {showDate && <DateSeparator date={msg.created_at} />}
                          <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-1`}>
                            <div
                              className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm ${
                                isOutbound
                                  ? "bg-primary text-primary-foreground rounded-br-sm"
                                  : "bg-muted rounded-bl-sm"
                              }`}
                            >
                              {quotedContent && (
                                <div className={`text-xs border-l-2 pl-2 mb-1 line-clamp-2 ${isOutbound ? "border-primary-foreground/40 text-primary-foreground/70" : "border-primary/40 text-muted-foreground"}`}>
                                  {quotedContent}
                                </div>
                              )}

                              {msg.media_type && msg.media_url ? (
                                <MediaMessage
                                  messageId={msg.message_id}
                                  mediaUrl={msg.media_url}
                                  mediaType={msg.media_type}
                                  content={msg.content}
                                  instanceName={selectedConversation.instance_name_raw}
                                  remoteJid={selectedConversation.remote_jid}
                                  isOutbound={isOutbound}
                                  mediaThumbnail={msg.media_thumbnail}
                                  mediaWidth={msg.media_width}
                                  mediaHeight={msg.media_height}
                                  metadataMimeType={msg.media_mime_type}
                                />
                              ) : msg.content ? (
                                <WhatsAppFormatted text={formatMessageContent(msg.content)} />
                              ) : (
                                <span className="italic text-muted-foreground text-xs">[Mensagem sem conteúdo]</span>
                              )}

                              <div className={`text-[10px] mt-0.5 text-right ${isOutbound ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                {time}
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Read-only footer */}
              <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs">Modo monitoramento — envio de mensagens desabilitado</span>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Eye className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Selecione uma conversa</p>
              <p className="text-xs mt-1">Escolha uma conversa na lista para visualizar as mensagens</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Monitoring;
