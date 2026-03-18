import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  LayoutDashboard,
  Users,
  Settings,
  Shield,
  LogOut,
  RefreshCw,
  Reply,
  Crown,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";

const navItems = [
  { title: "Dashboard", icon: LayoutDashboard, path: "/" },
  { title: "CRM", icon: Users, path: "/crm" },
  { title: "WhatsApp", icon: MessageCircle, path: "/whatsapp" },
  { title: "Configurações", icon: Settings, path: "/settings" },
  { title: "Admin", icon: Shield, path: "/admin" },
];

// Deterministic color for group participants
const SENDER_COLORS = [
  "text-emerald-600", "text-blue-600", "text-purple-600", "text-orange-600",
  "text-pink-600", "text-teal-600", "text-indigo-600", "text-rose-600",
  "text-cyan-600", "text-amber-600", "text-lime-600", "text-fuchsia-600",
];

function getSenderColor(sender: string): string {
  let hash = 0;
  for (let i = 0; i < sender.length; i++) {
    hash = ((hash << 5) - hash + sender.charCodeAt(i)) | 0;
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

interface GroupInfo {
  subject: string;
  description?: string | null;
  size?: number;
  pictureUrl?: string | null;
  participants: Array<{ id: string; admin: string | null; phone: string | null }>;
}

interface ReplyTarget {
  messageId: string;
  content: string;
  senderName: string;
}

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
  const [profilePics, setProfilePics] = useState<Record<string, string>>({});
  const [profilePictureSupported, setProfilePictureSupported] = useState(true);
  const [syncState, setSyncState] = useState<"syncing" | "waiting" | "ready">("syncing");
  const [groupInfoCache, setGroupInfoCache] = useState<Record<string, GroupInfo>>({});
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [sendingCount, setSendingCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingProfileFetchesRef = useRef<Set<string>>(new Set());
  const groupInfoFetchedRef = useRef<Set<string>>(new Set());

  const isSending = sendingCount > 0;

  const updateConversationPreview = useCallback((conversationId: string, preview: string, at: string) => {
    setConversations((prev) =>
      prev.map((c) => c.id === conversationId ? { ...c, last_message: preview, last_message_at: at } : c),
    );
    setSelectedConv((prev) => prev?.id === conversationId ? { ...prev, last_message: preview, last_message_at: at } : prev);
  }, []);

  const addOptimisticMessage = useCallback((message: WhatsAppMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const removeOptimisticMessage = useCallback((tempId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
  }, []);

  // ── Load instances ──
  const loadInstances = useCallback(async () => {
    try {
      const data = await listInstances();
      const connected = (data.instances || []).filter((i: EvolutionInstance) => i.status === "connected");
      setInstances(connected);
      if (connected.length === 0) {
        setSelectedInstanceId("");
        setConversations([]);
        setSelectedConv(null);
        return;
      }
      if (!selectedInstanceId || !connected.some((i: EvolutionInstance) => i.id === selectedInstanceId)) {
        setSelectedInstanceId(connected[0].id);
      }
    } catch { /* UI handles */ }
  }, [listInstances, selectedInstanceId]);

  useEffect(() => { loadInstances(); }, [loadInstances]);

  // ── Fetch conversations ──
  const fetchConversations = useCallback(async () => {
    if (!selectedInstanceId) { setConversations([]); setLoadingConvs(false); return; }
    setLoadingConvs(true);
    try {
      const data = await listConversations(selectedInstanceId);
      const convs = data.conversations || [];
      setConversations(convs);
      setSyncState(convs.length === 0 ? "waiting" : "ready");
    } catch { /* UI handles */ }
    finally { setLoadingConvs(false); }
  }, [listConversations, selectedInstanceId]);

  useEffect(() => {
    setSyncState("syncing");
    groupInfoFetchedRef.current.clear();
    fetchConversations();
  }, [fetchConversations]);

  // ── Load messages ──
  useEffect(() => {
    if (!selectedConv) return;
    const load = async () => {
      setLoadingMsgs(true);
      try {
        const data = await listMessages(selectedConv.id);
        setMessages(data.messages || []);
      } catch { /* UI handles */ }
      finally { setLoadingMsgs(false); }
    };
    load();
  }, [selectedConv?.id, listMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Realtime: conversations ──
  useEffect(() => {
    if (!selectedInstanceId) return;
    const ch = supabase
      .channel(`whatsapp-conversations:${selectedInstanceId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "whatsapp_conversations",
        filter: `instance_id=eq.${selectedInstanceId}`,
      }, () => { fetchConversations(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedInstanceId, fetchConversations]);

  // ── Realtime: messages ──
  useEffect(() => {
    if (!selectedConv?.id) return;
    const ch = supabase
      .channel(`conversation:${selectedConv.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "whatsapp_messages",
        filter: `conversation_id=eq.${selectedConv.id}`,
      }, (payload) => {
        const newMsg = payload.new as WhatsAppMessage;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          const optIdx = prev.findIndex(
            (m) => m.id.startsWith("temp-") && m.direction === newMsg.direction && m.content === newMsg.content,
          );
          if (optIdx >= 0) {
            const next = [...prev];
            next[optIdx] = newMsg;
            return next;
          }
          return [...prev, newMsg];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedConv?.id]);

  // ── Auto-fetch group info ──
  useEffect(() => {
    if (!selectedInstanceId || conversations.length === 0) return;
    const inst = instances.find((i) => i.id === selectedInstanceId);
    if (!inst) return;

    const needsInfo = conversations.filter((c) => {
      if (!c.remote_jid.endsWith("@g.us")) return false;
      if (groupInfoFetchedRef.current.has(c.remote_jid)) return false;
      const name = c.contact_name || "";
      return !name || name.startsWith("Grupo ") || /^\d+$/.test(name);
    });

    if (needsInfo.length === 0) return;

    const fetchInfos = async () => {
      for (const conv of needsInfo.slice(0, 10)) {
        groupInfoFetchedRef.current.add(conv.remote_jid);
        try {
          const info = await fetchGroupInfo(inst.instance_name, conv.remote_jid);
          if (info?.subject) {
            setConversations((prev) => prev.map((c) => c.id === conv.id ? { ...c, contact_name: info.subject } : c));
            setSelectedConv((prev) => prev?.id === conv.id ? { ...prev, contact_name: info.subject } : prev);
            setGroupInfoCache((prev) => ({
              ...prev,
              [conv.remote_jid]: {
                subject: info.subject,
                description: info.description,
                size: info.size,
                pictureUrl: info.pictureUrl,
                participants: info.participants || [],
              },
            }));
          }
          if (info?.pictureUrl) {
            setProfilePics((prev) => ({ ...prev, [conv.remote_jid]: info.pictureUrl }));
          }
        } catch { /* silently ignore */ }
      }
    };
    fetchInfos();
  }, [selectedInstanceId, conversations, instances, fetchGroupInfo]);

  // ── Fetch profile pictures ──
  useEffect(() => {
    if (!profilePictureSupported || !selectedInstanceId || conversations.length === 0) return;
    const inst = instances.find((i) => i.id === selectedInstanceId);
    if (!inst) return;

    const queue = conversations
      .filter((c) => !profilePics[c.remote_jid])
      .slice(0, 8);

    if (queue.length === 0) return;

    const fetchPics = async () => {
      await Promise.allSettled(
        queue.map(async (c) => {
          const key = `${inst.id}:${c.remote_jid}`;
          if (pendingProfileFetchesRef.current.has(key)) return;
          pendingProfileFetchesRef.current.add(key);
          try {
            const data = await getProfilePicture(inst.instance_name, c.remote_jid);
            if (data?.profilePictureUrl) {
              setProfilePics((prev) => ({ ...prev, [c.remote_jid]: data.profilePictureUrl }));
            }
          } catch (err: any) {
            if (String(err?.message || "").includes("Unknown action: get_profile_picture")) {
              setProfilePictureSupported(false);
            }
          } finally {
            pendingProfileFetchesRef.current.delete(key);
          }
        }),
      );
    };
    fetchPics();
  }, [profilePictureSupported, selectedInstanceId, conversations, instances, profilePics, getProfilePicture]);

  // ── Fetch group info when selecting a group conversation ──
  useEffect(() => {
    if (!selectedConv || !selectedConv.remote_jid.endsWith("@g.us")) return;
    if (groupInfoCache[selectedConv.remote_jid]) return;
    const inst = instances.find((i) => i.id === selectedInstanceId);
    if (!inst) return;

    const fetch = async () => {
      try {
        const info = await fetchGroupInfo(inst.instance_name, selectedConv.remote_jid);
        if (info?.subject) {
          setGroupInfoCache((prev) => ({
            ...prev,
            [selectedConv.remote_jid]: {
              subject: info.subject,
              description: info.description,
              size: info.size,
              pictureUrl: info.pictureUrl,
              participants: info.participants || [],
            },
          }));
          if (info.pictureUrl) {
            setProfilePics((prev) => ({ ...prev, [selectedConv.remote_jid]: info.pictureUrl }));
          }
          setSelectedConv((prev) => prev?.id === selectedConv.id ? { ...prev, contact_name: info.subject } : prev);
        }
      } catch { /* ignore */ }
    };
    fetch();
  }, [selectedConv?.id, selectedConv?.remote_jid, groupInfoCache, instances, selectedInstanceId, fetchGroupInfo]);

  // ── Send text ──
  const handleSendText = async () => {
    if (!selectedConv || !messageText.trim()) return;
    const inst = instances.find((i) => i.id === selectedConv.instance_id);
    if (!inst) { toast({ title: "Erro", description: "Instância não encontrada", variant: "destructive" }); return; }

    const payloadText = messageText.trim();
    const now = new Date().toISOString();
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const currentReply = replyTarget;

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
      metadata: {
        optimistic: true,
        quotedMessageId: currentReply?.messageId || null,
        quotedContent: currentReply?.content || null,
      },
      created_at: now,
    };

    addOptimisticMessage(optimisticMessage);
    updateConversationPreview(selectedConv.id, payloadText, now);
    setMessageText("");
    setReplyTarget(null);
    setSendingCount((c) => c + 1);

    try {
      await sendText(inst.instance_name, selectedConv.remote_jid, payloadText, currentReply?.messageId);
    } catch (err: any) {
      removeOptimisticMessage(tempId);
      setMessageText(payloadText);
      toast({ title: "Erro ao enviar", description: err?.message || "Falha no envio", variant: "destructive" });
    } finally {
      setSendingCount((c) => Math.max(0, c - 1));
    }
  };

  // ── Send file ──
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedConv) return;
    const inst = instances.find((i) => i.id === selectedConv.instance_id);
    if (!inst) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      let mediatype = "document";
      if (file.type === "image/webp") mediatype = "sticker";
      else if (file.type.startsWith("image/")) mediatype = "image";
      else if (file.type.startsWith("audio/")) mediatype = "audio";
      else if (file.type.startsWith("video/")) mediatype = "video";

      const labelMap: Record<string, string> = { image: file.name, audio: "[Áudio]", video: "[Vídeo]", document: file.name || "[Documento]", sticker: "[Sticker]" };
      const previewText = labelMap[mediatype] || "[Mídia]";
      const previewMediaUrl = (mediatype === "image" || mediatype === "sticker") ? base64 : null;
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
      setSendingCount((c) => c + 1);

      try {
        await sendMedia(inst.instance_name, selectedConv.remote_jid, mediatype, base64, mediatype === "image" ? file.name : undefined, file.name);
      } catch (err: any) {
        removeOptimisticMessage(tempId);
        toast({ title: "Erro ao enviar mídia", description: err?.message || "Falha no envio", variant: "destructive" });
      } finally {
        setSendingCount((c) => Math.max(0, c - 1));
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.contact_name?.toLowerCase().includes(q) || c.contact_phone?.toLowerCase().includes(q) || c.last_message?.toLowerCase().includes(q);
  });

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((p) => p[0]).join("").substring(0, 2).toUpperCase();
  };

  const formatTime = (d: string | null) => {
    if (!d) return "";
    try { return format(new Date(d), "HH:mm"); } catch { return ""; }
  };

  const formatDate = (d: string) => {
    try {
      const date = new Date(d);
      const today = new Date();
      if (date.toDateString() === today.toDateString()) return formatTime(d);
      return format(date, "dd/MM/yyyy HH:mm");
    } catch { return ""; }
  };

  const isGroupJid = (jid: string) => jid.endsWith("@g.us");

  // Get sender display name from message metadata
  const getSenderName = (msg: WhatsAppMessage): string | null => {
    const meta = msg.metadata as Record<string, any> | null;
    if (!meta?.isGroup) return null;
    return meta?.pushName || meta?.senderPhone || null;
  };

  // Get quoted info from metadata
  const getQuotedInfo = (msg: WhatsAppMessage): { id: string; content: string } | null => {
    const meta = msg.metadata as Record<string, any> | null;
    if (!meta?.quotedMessageId) return null;
    return { id: meta.quotedMessageId, content: meta.quotedContent || "[Mensagem]" };
  };

  // Find message content by message_id for quote display
  const messageByMsgId = useMemo(() => {
    const map = new Map<string, WhatsAppMessage>();
    for (const m of messages) {
      if (m.message_id) map.set(m.message_id, m);
    }
    return map;
  }, [messages]);

  const currentGroupInfo = selectedConv ? groupInfoCache[selectedConv.remote_jid] : null;

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        {/* Compact sidebar */}
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">C</div>
              <span className="text-sm font-semibold text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden">CRM</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton asChild isActive={location.pathname === item.path} tooltip={item.title}>
                        <NavLink to={item.path}><item.icon className="h-4 w-4" /><span>{item.title}</span></NavLink>
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
              <div className="flex-1 truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{user?.email ?? ""}</div>
              <button onClick={signOut} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors group-data-[collapsible=icon]:hidden" title="Sair">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </SidebarFooter>
        </Sidebar>

        {/* Main area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Conversation list */}
          <div className="flex w-72 flex-col border-r border-border bg-background">
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <div className="flex items-center gap-2">
                <SidebarTrigger className="h-7 w-7" />
                <h2 className="text-sm font-semibold">Conversas</h2>
              </div>
              <div className="flex items-center gap-1">
                <Select value={selectedInstanceId} onValueChange={(v) => { setSelectedInstanceId(v); setSelectedConv(null); setMessages([]); }}>
                  <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {instances.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.display_name || i.phone_number || "Instância"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate("/whatsapp/settings")} title="Gerenciar instâncias">
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar conversa…" className="h-7 pl-8 text-xs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
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
                  <p className="mt-1 text-[11px] text-muted-foreground/60">As conversas aparecerão aqui automaticamente</p>
                </div>
              ) : (
                filteredConversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedConv(c); setShowContactPanel(false); setReplyTarget(null); }}
                    className={`flex w-full items-start gap-2.5 border-b border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${selectedConv?.id === c.id ? "bg-muted" : ""}`}
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      {profilePics[c.remote_jid] && <AvatarImage src={profilePics[c.remote_jid]} alt={c.contact_name || ""} />}
                      <AvatarFallback className="bg-primary/10 text-xs text-primary">
                        {isGroupJid(c.remote_jid) ? <Users className="h-4 w-4" /> : getInitials(c.contact_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-medium">{c.contact_name || c.contact_phone || "Desconhecido"}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(c.last_message_at)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between">
                        <p className="truncate text-xs text-muted-foreground">{c.last_message || "…"}</p>
                        {c.unread_count > 0 && (
                          <Badge className="ml-1 h-4 min-w-[16px] shrink-0 rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{c.unread_count}</Badge>
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
                {/* Chat header */}
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      {profilePics[selectedConv.remote_jid] && <AvatarImage src={profilePics[selectedConv.remote_jid]} alt={selectedConv.contact_name || ""} />}
                      <AvatarFallback className="bg-primary/10 text-xs text-primary">
                        {isGroupJid(selectedConv.remote_jid) ? <Users className="h-4 w-4" /> : getInitials(selectedConv.contact_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{selectedConv.contact_name || selectedConv.contact_phone || "Desconhecido"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {isGroupJid(selectedConv.remote_jid)
                          ? `Grupo · ${currentGroupInfo?.size || "…"} participantes`
                          : selectedConv.contact_phone}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowContactPanel((v) => !v)}>
                    <User className="h-4 w-4" />
                    <ChevronRight className={`ml-1 h-3 w-3 transition-transform ${showContactPanel ? "rotate-180" : ""}`} />
                  </Button>
                </div>

                {/* Messages */}
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
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {messages.map((msg) => {
                        const isOutbound = msg.direction === "outbound";
                        const isGrp = isGroupJid(selectedConv.remote_jid);
                        const senderName = getSenderName(msg);
                        const quoted = getQuotedInfo(msg);

                        return (
                          <div key={msg.id} className={`group flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                            <div className={`relative max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
                              isOutbound ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted"
                            } ${msg.id.startsWith("temp-") ? "opacity-70" : ""}`}>

                              {/* Sender name for group messages */}
                              {isGrp && !isOutbound && senderName && (
                                <p className={`text-xs font-semibold mb-0.5 ${getSenderColor(senderName)}`}>
                                  {senderName}
                                </p>
                              )}

                              {/* Quoted message */}
                              {quoted && (
                                <div className={`mb-1.5 rounded-md border-l-2 px-2 py-1 text-[11px] ${
                                  isOutbound
                                    ? "border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground/80"
                                    : "border-primary/40 bg-primary/5 text-muted-foreground"
                                }`}>
                                  <p className="truncate">{quoted.content}</p>
                                </div>
                              )}

                              {/* Media */}
                              {msg.media_type === "image" && msg.media_url && (
                                <img src={msg.media_url} alt="Imagem" className="mb-1 max-w-full rounded-lg" loading="lazy" />
                              )}
                              {msg.media_type === "sticker" && msg.media_url && (
                                <img src={msg.media_url} alt="Sticker" className="mb-1 max-h-36 max-w-full rounded-lg" loading="lazy" />
                              )}
                              {msg.media_type === "video" && msg.media_url && (
                                <video controls className="mb-1 max-w-full rounded-lg"><source src={msg.media_url} /></video>
                              )}
                              {msg.media_type === "audio" && msg.media_url && (
                                <audio controls className="mb-1 max-w-full"><source src={msg.media_url} /></audio>
                              )}
                              {msg.media_type === "document" && (
                                <div className="mb-1 flex items-center gap-2 rounded bg-background/20 p-2 text-xs">
                                  <Paperclip className="h-3.5 w-3.5" /><span>{msg.content || "Documento"}</span>
                                </div>
                              )}

                              {msg.content && msg.media_type !== "document" && (
                                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                              )}

                              <p className={`mt-1 text-right text-[10px] ${isOutbound ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                {formatDate(msg.created_at)}
                              </p>

                              {/* Reply button */}
                              <button
                                className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1 hover:bg-muted"
                                onClick={() => setReplyTarget({
                                  messageId: msg.message_id || msg.id,
                                  content: msg.content || "[Mídia]",
                                  senderName: senderName || (isOutbound ? "Você" : selectedConv.contact_name || ""),
                                })}
                                title="Responder"
                              >
                                <Reply className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                {/* Reply bar */}
                {replyTarget && (
                  <div className="flex items-center gap-2 border-t border-border bg-muted/50 px-4 py-2">
                    <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 overflow-hidden">
                      <p className="text-xs font-medium text-primary">{replyTarget.senderName}</p>
                      <p className="truncate text-xs text-muted-foreground">{replyTarget.content}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setReplyTarget(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {/* Input bar */}
                <div className="border-t border-border px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={handleFileUpload} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => fileInputRef.current?.click()}>
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                      if (!fileInputRef.current) return;
                      fileInputRef.current.accept = "image/*";
                      fileInputRef.current.click();
                      fileInputRef.current.accept = "image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";
                    }}>
                      <Image className="h-4 w-4" />
                    </Button>
                    <Input
                      placeholder="Digite uma mensagem…"
                      className="flex-1 h-8"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                    />
                    <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleSendText} disabled={!messageText.trim()}>
                      {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <MessageCircle className="mb-3 h-12 w-12 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">Selecione uma conversa</p>
                <p className="mt-1 text-xs text-muted-foreground/70">Escolha uma conversa à esquerda para começar</p>
              </div>
            )}
          </div>

          {/* Detail panel */}
          {showContactPanel && selectedConv && (
            <div className="w-72 border-l border-border overflow-hidden flex flex-col">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h3 className="text-sm font-semibold">
                  {isGroupJid(selectedConv.remote_jid) ? "Detalhes do grupo" : "Detalhes do contato"}
                </h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowContactPanel(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <ScrollArea className="flex-1">
                <div className="space-y-4 p-4">
                  <div className="flex flex-col items-center text-center">
                    <Avatar className="mb-2 h-16 w-16">
                      {profilePics[selectedConv.remote_jid] && <AvatarImage src={profilePics[selectedConv.remote_jid]} alt={selectedConv.contact_name || ""} />}
                      <AvatarFallback className="bg-primary/10 text-lg text-primary">
                        {isGroupJid(selectedConv.remote_jid) ? <Users className="h-7 w-7" /> : getInitials(selectedConv.contact_name)}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-sm font-semibold">{selectedConv.contact_name || "Desconhecido"}</p>
                    <p className="text-xs text-muted-foreground">
                      {isGroupJid(selectedConv.remote_jid) ? `Grupo · ${currentGroupInfo?.size || "…"} participantes` : selectedConv.contact_phone}
                    </p>
                  </div>

                  {/* Group description */}
                  {isGroupJid(selectedConv.remote_jid) && currentGroupInfo?.description && (
                    <>
                      <Separator />
                      <div>
                        <p className="mb-1 text-xs font-medium">Descrição</p>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{currentGroupInfo.description}</p>
                      </div>
                    </>
                  )}

                  <Separator />

                  <div className="space-y-3">
                    {!isGroupJid(selectedConv.remote_jid) && (
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
                        {isGroupJid(selectedConv.remote_jid) ? "Grupo WhatsApp" : "Lead WhatsApp"}
                      </Badge>
                    </div>
                  </div>

                  {/* Group participants */}
                  {isGroupJid(selectedConv.remote_jid) && currentGroupInfo?.participants && currentGroupInfo.participants.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="mb-2 text-xs font-medium">{currentGroupInfo.participants.length} participantes</p>
                        <div className="space-y-1.5 max-h-60 overflow-y-auto">
                          {currentGroupInfo.participants.map((p, idx) => (
                            <div key={p.id || idx} className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                {p.phone && profilePics[`${p.phone}@s.whatsapp.net`] && (
                                  <AvatarImage src={profilePics[`${p.phone}@s.whatsapp.net`]} />
                                )}
                                <AvatarFallback className="bg-muted text-[10px]">
                                  {(p.phone || "?").slice(-2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 overflow-hidden">
                                <p className="text-xs truncate">{p.phone || p.id}</p>
                              </div>
                              {p.admin === "admin" && (
                                <ShieldCheck className="h-3 w-3 text-blue-500 shrink-0" title="Admin" />
                              )}
                              {p.admin === "superadmin" && (
                                <Crown className="h-3 w-3 text-amber-500 shrink-0" title="Super Admin" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <Separator />

                  <div>
                    <p className="mb-1 text-xs font-medium">Instância</p>
                    <p className="text-xs text-muted-foreground">
                      {instances.find((i) => i.id === selectedConv.instance_id)?.display_name ||
                        instances.find((i) => i.id === selectedConv.instance_id)?.phone_number || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium">Primeira mensagem</p>
                    <p className="text-xs text-muted-foreground">{formatDate(selectedConv.created_at)}</p>
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
};

export default WhatsAppInbox;
