import { useState, useEffect, useCallback, useRef } from "react";
import { useEvolutionApi, type Conversation, type WhatsAppMessage, type EvolutionInstance } from "@/hooks/use-evolution-api";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  MessageCircle,
  Send,
  Image,
  Paperclip,
  Search,
  Phone,
  User,
  Tag,
  X,
  Loader2,
  ChevronRight,
  Plus,
  LayoutDashboard,
  Users,
  Settings,
  Shield,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

const navItems = [
  { title: "Dashboard", icon: LayoutDashboard, path: "/" },
  { title: "CRM", icon: Users, path: "/crm" },
  { title: "WhatsApp", icon: MessageCircle, path: "/whatsapp" },
  { title: "Configurações", icon: Settings, path: "/settings" },
  { title: "Admin", icon: Shield, path: "/admin" },
];

const WhatsAppInbox = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const {
    listInstances,
    listConversations,
    listMessages,
    sendText,
    sendMedia,
    getProfilePicture,
    fetchGroupInfo,
  } = useEvolutionApi();

  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [profilePics, setProfilePics] = useState<Record<string, string>>({});
  const [profilePictureSupported, setProfilePictureSupported] = useState(true);
  const [syncState, setSyncState] = useState<"syncing" | "waiting" | "ready">("syncing");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingProfileFetchesRef = useRef<Set<string>>(new Set());
  const groupInfoFetchedRef = useRef<Set<string>>(new Set());

  const updateConversationPreview = useCallback((conversationId: string, preview: string, at: string) => {
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, last_message: preview, last_message_at: at }
          : conversation,
      ),
    );
    setSelectedConv((prev) => {
      if (!prev || prev.id !== conversationId) return prev;
      return { ...prev, last_message: preview, last_message_at: at };
    });
  }, []);

  const addOptimisticMessage = useCallback((message: WhatsAppMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const removeOptimisticMessage = useCallback((tempId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
  }, []);

  const loadInstances = useCallback(async () => {
    try {
      const data = await listInstances();
      const connected = (data.instances || []).filter((instance: EvolutionInstance) => instance.status === "connected");
      setInstances(connected);

      if (connected.length === 0) {
        setSelectedInstanceId("");
        setConversations([]);
        setSelectedConv(null);
        return;
      }

      if (!selectedInstanceId || !connected.some((instance: EvolutionInstance) => instance.id === selectedInstanceId)) {
        setSelectedInstanceId(connected[0].id);
      }
    } catch {
      // handled by UI state
    }
  }, [listInstances, selectedInstanceId]);

  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  const fetchConversations = useCallback(async () => {
    if (!selectedInstanceId) {
      setConversations([]);
      setLoadingConvs(false);
      return;
    }

    setLoadingConvs(true);
    try {
      const data = await listConversations(selectedInstanceId);
      const convs = data.conversations || [];
      setConversations(convs);
      if (convs.length === 0) {
        setSyncState("waiting");
      } else {
        setSyncState("ready");
      }
    } catch {
      // handled by UI state
    } finally {
      setLoadingConvs(false);
    }
  }, [listConversations, selectedInstanceId]);

  useEffect(() => {
    setSyncState("syncing");
    groupInfoFetchedRef.current.clear();
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedConv) return;

    const load = async () => {
      setLoadingMsgs(true);
      try {
        const data = await listMessages(selectedConv.id);
        setMessages(data.messages || []);
      } catch {
        // handled by UI state
      } finally {
        setLoadingMsgs(false);
      }
    };

    load();
  }, [selectedConv?.id, listMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime: conversations channel
  useEffect(() => {
    if (!selectedInstanceId) return;

    const convChannel = supabase
      .channel(`whatsapp-conversations:${selectedInstanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_conversations",
          filter: `instance_id=eq.${selectedInstanceId}`,
        },
        () => {
          fetchConversations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(convChannel);
    };
  }, [selectedInstanceId, fetchConversations]);

  // Realtime: messages channel (filtered by conversation_id)
  useEffect(() => {
    if (!selectedConv?.id) return;

    const msgChannel = supabase
      .channel(`conversation:${selectedConv.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `conversation_id=eq.${selectedConv.id}`,
        },
        (payload) => {
          const newMsg = payload.new as WhatsAppMessage;

          setMessages((prev) => {
            if (prev.some((msg) => msg.id === newMsg.id)) return prev;

            const optimisticIndex = prev.findIndex(
              (msg) =>
                msg.id.startsWith("temp-") &&
                msg.direction === newMsg.direction &&
                msg.media_type === newMsg.media_type &&
                msg.content === newMsg.content,
            );

            if (optimisticIndex >= 0) {
              const next = [...prev];
              next[optimisticIndex] = newMsg;
              return next;
            }

            return [...prev, newMsg];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
    };
  }, [selectedConv?.id]);

  // Auto-fetch group info for groups with fallback names
  useEffect(() => {
    if (!selectedInstanceId || conversations.length === 0) return;

    const selectedInstance = instances.find((inst) => inst.id === selectedInstanceId);
    if (!selectedInstance) return;

    const groupsNeedingInfo = conversations.filter((c) => {
      if (!c.remote_jid.endsWith("@g.us")) return false;
      if (groupInfoFetchedRef.current.has(c.remote_jid)) return false;
      // Needs info if name is missing, starts with "Grupo ", or is just digits
      const name = c.contact_name || "";
      return !name || name.startsWith("Grupo ") || /^\d+$/.test(name);
    });

    if (groupsNeedingInfo.length === 0) return;

    const fetchGroupInfos = async () => {
      for (const conv of groupsNeedingInfo.slice(0, 10)) {
        groupInfoFetchedRef.current.add(conv.remote_jid);
        try {
          const info = await fetchGroupInfo(selectedInstance.instance_name, conv.remote_jid);
          if (info?.subject) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conv.id ? { ...c, contact_name: info.subject } : c,
              ),
            );
            // Update selectedConv if it's the same
            setSelectedConv((prev) =>
              prev?.id === conv.id ? { ...prev, contact_name: info.subject } : prev,
            );
          }
          if (info?.pictureUrl) {
            setProfilePics((prev) => ({ ...prev, [conv.remote_jid]: info.pictureUrl }));
          }
        } catch {
          // silently ignore
        }
      }
    };

    fetchGroupInfos();
  }, [selectedInstanceId, conversations, instances, fetchGroupInfo]);

  // Fetch profile pictures for contacts AND groups
  useEffect(() => {
    if (!profilePictureSupported) return;
    if (!selectedInstanceId || conversations.length === 0) return;

    const selectedInstance = instances.find((instance) => instance.id === selectedInstanceId);
    if (!selectedInstance) return;

    const queue = conversations
      .filter((conversation) => !conversation.remote_jid.endsWith("@g.us"))
      .filter((conversation) => !profilePics[conversation.remote_jid])
      .slice(0, 8);

    if (queue.length === 0) return;

    const fetchPictures = async () => {
      await Promise.allSettled(
        queue.map(async (conversation) => {
          const requestKey = `${selectedInstance.id}:${conversation.remote_jid}`;
          if (pendingProfileFetchesRef.current.has(requestKey)) return;

          pendingProfileFetchesRef.current.add(requestKey);
          try {
            const data = await getProfilePicture(selectedInstance.instance_name, conversation.remote_jid);
            const url = data?.profilePictureUrl;
            if (url) {
              setProfilePics((prev) => ({ ...prev, [conversation.remote_jid]: url }));
            }
          } catch (error: any) {
            const message = String(error?.message || "");
            if (message.includes("Unknown action: get_profile_picture")) {
              setProfilePictureSupported(false);
            }
          } finally {
            pendingProfileFetchesRef.current.delete(requestKey);
          }
        }),
      );
    };

    fetchPictures();
  }, [profilePictureSupported, selectedInstanceId, conversations, instances, profilePics, getProfilePicture]);

  const handleSendText = async () => {
    if (!selectedConv || !messageText.trim()) return;

    const selectedInstance = instances.find((instance) => instance.id === selectedConv.instance_id);
    if (!selectedInstance) {
      toast({ title: "Erro", description: "Instância não encontrada", variant: "destructive" });
      return;
    }

    const payloadText = messageText.trim();
    const now = new Date().toISOString();
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const optimisticMessage: WhatsAppMessage = {
      id: tempId,
      tenant_id: selectedConv.tenant_id,
      conversation_id: selectedConv.id,
      message_id: null,
      direction: "outbound",
      content: payloadText,
      media_url: null,
      media_type: null,
      status: "pending",
      metadata: { optimistic: true },
      created_at: now,
    };

    addOptimisticMessage(optimisticMessage);
    updateConversationPreview(selectedConv.id, payloadText, now);
    setMessageText("");
    setSending(true);

    try {
      await sendText(selectedInstance.instance_name, selectedConv.remote_jid, payloadText);
    } catch (error: any) {
      removeOptimisticMessage(tempId);
      setMessageText(payloadText);
      toast({
        title: "Erro ao enviar",
        description: error?.message || "Falha no envio da mensagem",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedConv) return;

    const selectedInstance = instances.find((instance) => instance.id === selectedConv.instance_id);
    if (!selectedInstance) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;

      let mediatype = "document";
      if (file.type === "image/webp") mediatype = "sticker";
      else if (file.type.startsWith("image/")) mediatype = "image";
      else if (file.type.startsWith("audio/")) mediatype = "audio";
      else if (file.type.startsWith("video/")) mediatype = "video";

      const labelByType: Record<string, string> = {
        image: file.name,
        audio: "[Áudio]",
        video: "[Vídeo]",
        document: file.name || "[Documento]",
        sticker: "[Sticker]",
      };

      const previewText = labelByType[mediatype] || "[Mídia]";
      const previewMediaUrl = mediatype === "image" || mediatype === "sticker" ? base64 : null;
      const now = new Date().toISOString();
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const optimisticMessage: WhatsAppMessage = {
        id: tempId,
        tenant_id: selectedConv.tenant_id,
        conversation_id: selectedConv.id,
        message_id: null,
        direction: "outbound",
        content: previewText,
        media_url: previewMediaUrl,
        media_type: mediatype,
        status: "pending",
        metadata: { optimistic: true, fileName: file.name },
        created_at: now,
      };

      addOptimisticMessage(optimisticMessage);
      updateConversationPreview(selectedConv.id, previewText, now);
      setSending(true);

      try {
        await sendMedia(
          selectedInstance.instance_name,
          selectedConv.remote_jid,
          mediatype,
          base64,
          mediatype === "image" ? file.name : undefined,
          file.name,
        );
      } catch (error: any) {
        removeOptimisticMessage(tempId);
        toast({
          title: "Erro ao enviar mídia",
          description: error?.message || "Falha no envio da mídia",
          variant: "destructive",
        });
      } finally {
        setSending(false);
      }
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const filteredConversations = conversations.filter((conversation) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      conversation.contact_name?.toLowerCase().includes(query) ||
      conversation.contact_phone?.toLowerCase().includes(query) ||
      conversation.last_message?.toLowerCase().includes(query)
    );
  });

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    try {
      return format(new Date(dateStr), "HH:mm");
    } catch {
      return "";
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const today = new Date();
      if (date.toDateString() === today.toDateString()) return formatTime(dateStr);
      return format(date, "dd/MM/yyyy HH:mm");
    } catch {
      return "";
    }
  };

  const isGroup = (jid: string) => jid.endsWith("@g.us");

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        {/* Compact sidebar */}
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                C
              </div>
              <span className="text-sm font-semibold text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden">
                CRM
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={location.pathname === item.path}
                        tooltip={item.title}
                      >
                        <NavLink to={item.path}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border p-3">
            <div className="flex items-center gap-2 px-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {user?.email?.charAt(0).toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                {user?.email ?? ""}
              </div>
              <button
                onClick={signOut}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors group-data-[collapsible=icon]:hidden"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </SidebarFooter>
        </Sidebar>

        {/* Main area: full screen inbox */}
        <div className="flex flex-1 overflow-hidden">
          {/* Conversation list */}
          <div className="flex w-72 flex-col border-r border-border bg-background">
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <div className="flex items-center gap-2">
                <SidebarTrigger className="h-7 w-7" />
                <h2 className="text-sm font-semibold">Conversas</h2>
              </div>
              <div className="flex items-center gap-1">
                <Select
                  value={selectedInstanceId}
                  onValueChange={(value) => {
                    setSelectedInstanceId(value);
                    setSelectedConv(null);
                    setMessages([]);
                  }}
                >
                  <SelectTrigger className="h-7 w-[130px] text-xs">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.map((instance) => (
                      <SelectItem key={instance.id} value={instance.id}>
                        {instance.display_name || instance.phone_number || "Instância"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => navigate("/whatsapp/settings")}
                  title="Gerenciar instâncias"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar conversa…"
                  className="h-7 pl-8 text-xs"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              {loadingConvs ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">Sincronizando conversas…</p>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                  <RefreshCw className="mb-2 h-6 w-6 text-muted-foreground/40 animate-spin" />
                  <p className="text-xs font-medium text-muted-foreground">Aguardando novas mensagens</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/60">
                    As conversas aparecerão aqui automaticamente
                  </p>
                </div>
              ) : (
                filteredConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => {
                      setSelectedConv(conversation);
                      setShowContactPanel(false);
                    }}
                    className={`flex w-full items-start gap-2.5 border-b border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                      selectedConv?.id === conversation.id ? "bg-muted" : ""
                    }`}
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      {profilePics[conversation.remote_jid] && (
                        <AvatarImage src={profilePics[conversation.remote_jid]} alt={conversation.contact_name || ""} />
                      )}
                      <AvatarFallback className="bg-primary/10 text-xs text-primary">
                        {isGroup(conversation.remote_jid) ? (
                          <Users className="h-4 w-4" />
                        ) : (
                          getInitials(conversation.contact_name)
                        )}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-medium">
                          {conversation.contact_name || conversation.contact_phone || "Desconhecido"}
                        </p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatTime(conversation.last_message_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between">
                        <p className="truncate text-xs text-muted-foreground">{conversation.last_message || "…"}</p>
                        {conversation.unread_count > 0 && (
                          <Badge className="ml-1 h-4 min-w-[16px] shrink-0 rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                            {conversation.unread_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </ScrollArea>
          </div>

          {/* Chat area */}
          <div className="flex flex-1 flex-col">
            {selectedConv ? (
              <>
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      {profilePics[selectedConv.remote_jid] && (
                        <AvatarImage src={profilePics[selectedConv.remote_jid]} alt={selectedConv.contact_name || ""} />
                      )}
                      <AvatarFallback className="bg-primary/10 text-xs text-primary">
                        {isGroup(selectedConv.remote_jid) ? (
                          <Users className="h-4 w-4" />
                        ) : (
                          getInitials(selectedConv.contact_name)
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">
                        {selectedConv.contact_name || selectedConv.contact_phone || "Desconhecido"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {isGroup(selectedConv.remote_jid) ? "Grupo" : selectedConv.contact_phone}
                      </p>
                    </div>
                  </div>

                  <Button variant="ghost" size="sm" onClick={() => setShowContactPanel((value) => !value)}>
                    <User className="h-4 w-4" />
                    <ChevronRight
                      className={`ml-1 h-3 w-3 transition-transform ${showContactPanel ? "rotate-180" : ""}`}
                    />
                  </Button>
                </div>

                <ScrollArea className="flex-1 px-4 py-3">
                  {loadingMsgs ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <p className="text-xs text-muted-foreground">Sincronizando mensagens…</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <MessageCircle className="mb-2 h-8 w-8 text-muted-foreground/30" />
                      <p className="text-xs font-medium text-muted-foreground">Aguardando novas mensagens</p>
                      <p className="mt-1 text-[11px] text-muted-foreground/60">
                        As mensagens aparecerão aqui em tempo real
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
                              message.direction === "outbound"
                                ? "rounded-br-md bg-primary text-primary-foreground"
                                : "rounded-bl-md bg-muted"
                            } ${message.id.startsWith("temp-") ? "opacity-70" : ""}`}
                          >
                            {message.media_type === "image" && message.media_url && (
                              <img
                                src={message.media_url}
                                alt="Imagem"
                                className="mb-1 max-w-full rounded-lg"
                                loading="lazy"
                              />
                            )}

                            {message.media_type === "sticker" && message.media_url && (
                              <img
                                src={message.media_url}
                                alt="Sticker"
                                className="mb-1 max-h-36 max-w-full rounded-lg"
                                loading="lazy"
                              />
                            )}

                            {message.media_type === "video" && message.media_url && (
                              <video controls className="mb-1 max-w-full rounded-lg">
                                <source src={message.media_url} />
                              </video>
                            )}

                            {message.media_type === "audio" && message.media_url && (
                              <audio controls className="mb-1 max-w-full">
                                <source src={message.media_url} />
                              </audio>
                            )}

                            {message.media_type === "document" && (
                              <div className="mb-1 flex items-center gap-2 rounded bg-background/20 p-2 text-xs">
                                <Paperclip className="h-3.5 w-3.5" />
                                <span>{message.content || "Documento"}</span>
                              </div>
                            )}

                            {message.content && message.media_type !== "document" && (
                              <p className="whitespace-pre-wrap break-words">{message.content}</p>
                            )}

                            <p
                              className={`mt-1 text-right text-[10px] ${
                                message.direction === "outbound"
                                  ? "text-primary-foreground/60"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {formatDate(message.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                <div className="border-t border-border px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                      onChange={handleFileUpload}
                    />

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sending}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => {
                        if (!fileInputRef.current) return;
                        fileInputRef.current.accept = "image/*";
                        fileInputRef.current.click();
                        fileInputRef.current.accept =
                          "image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";
                      }}
                      disabled={sending}
                    >
                      <Image className="h-4 w-4" />
                    </Button>

                    <Input
                      placeholder="Digite uma mensagem…"
                      className="flex-1 h-8"
                      value={messageText}
                      onChange={(event) => setMessageText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          handleSendText();
                        }
                      }}
                      disabled={sending}
                    />

                    <Button
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={handleSendText}
                      disabled={sending || !messageText.trim()}
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <MessageCircle className="mb-3 h-12 w-12 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">Selecione uma conversa</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Escolha uma conversa à esquerda para começar
                </p>
              </div>
            )}
          </div>

          {/* Contact detail panel */}
          {showContactPanel && selectedConv && (
            <div className="w-64 border-l border-border">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h3 className="text-sm font-semibold">
                  {isGroup(selectedConv.remote_jid) ? "Detalhes do grupo" : "Detalhes do contato"}
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowContactPanel(false)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="space-y-4 p-4">
                <div className="flex flex-col items-center text-center">
                  <Avatar className="mb-2 h-14 w-14">
                    {profilePics[selectedConv.remote_jid] && (
                      <AvatarImage src={profilePics[selectedConv.remote_jid]} alt={selectedConv.contact_name || ""} />
                    )}
                    <AvatarFallback className="bg-primary/10 text-lg text-primary">
                      {isGroup(selectedConv.remote_jid) ? (
                        <Users className="h-6 w-6" />
                      ) : (
                        getInitials(selectedConv.contact_name)
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-sm font-semibold">{selectedConv.contact_name || "Desconhecido"}</p>
                  <p className="text-xs text-muted-foreground">
                    {isGroup(selectedConv.remote_jid) ? "Grupo" : selectedConv.contact_phone}
                  </p>
                </div>

                <Separator />

                <div className="space-y-3">
                  {!isGroup(selectedConv.remote_jid) && (
                    <div className="flex items-center gap-2 text-xs">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{selectedConv.contact_phone || "—"}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs">
                    <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Status: {selectedConv.status}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    <Badge variant="secondary" className="text-[10px]">
                      {isGroup(selectedConv.remote_jid) ? "Grupo WhatsApp" : "Lead WhatsApp"}
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="mb-1 text-xs font-medium">Instância</p>
                  <p className="text-xs text-muted-foreground">
                    {instances.find((instance) => instance.id === selectedConv.instance_id)?.display_name ||
                      instances.find((instance) => instance.id === selectedConv.instance_id)?.phone_number ||
                      "—"}
                  </p>
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium">Primeira mensagem</p>
                  <p className="text-xs text-muted-foreground">{formatDate(selectedConv.created_at)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
};

export default WhatsAppInbox;
