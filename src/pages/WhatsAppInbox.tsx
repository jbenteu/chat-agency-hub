import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useEvolutionApi, type Conversation, type WhatsAppMessage, type EvolutionInstance } from "@/hooks/use-evolution-api";
import { MediaMessage } from "@/components/whatsapp/MediaMessage";
import { TagSelector } from "@/components/whatsapp/TagSelector";
import {
  getInboxCache, setCachedInstances, setCachedSelectedInstance,
  setCachedConversations, getCachedConversations, setCachedMessages,
  getCachedMessages, setCachedProfilePic, getCachedProfilePics,
  setCachedGroupInfo, getCachedGroupInfoMap, isCacheFresh,
  type GroupInfo,
} from "@/hooks/use-inbox-cache";
import { queryInstances, queryConversations, queryMessages, queryMessagesSince, markConversationRead } from "@/hooks/use-direct-queries";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  MessageCircle, Send, Image, Paperclip, Search, Phone, User, Tag, X, Loader2,
  ChevronRight, LayoutDashboard, Users, Settings, Shield, LogOut, Reply, Crown,
  ShieldCheck, Mail, Building2, MapPin, Clock, Link2, UserMinus, ChevronUp,
  Copy, Edit2, Check, ChevronDown,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatPhoneWhatsApp, formatPhoneEdit, maskPhoneInput, detectCountryCode, COUNTRY_CODES } from "@/data/country-codes";
import { BRAZIL_STATES, BRAZIL_CITIES } from "@/data/brazil-locations";

const navItems = [
  { title: "Dashboard", icon: LayoutDashboard, path: "/" },
  { title: "CRM", icon: Users, path: "/crm" },
  { title: "WhatsApp", icon: MessageCircle, path: "/whatsapp" },
  { title: "Configurações", icon: Settings, path: "/settings" },
  { title: "Admin", icon: Shield, path: "/admin" },
];

const SENDER_COLORS = [
  "text-emerald-600", "text-blue-600", "text-purple-600", "text-orange-600",
  "text-pink-600", "text-teal-600", "text-indigo-600", "text-rose-600",
  "text-cyan-600", "text-amber-600", "text-lime-600", "text-fuchsia-600",
];

function getSenderColor(sender: string): string {
  let hash = 0;
  for (let i = 0; i < sender.length; i++) hash = ((hash << 5) - hash + sender.charCodeAt(i)) | 0;
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

interface ReplyTarget { messageId: string; content: string; senderName: string; }

interface ContactDetails {
  id: string; name: string; email: string | null; phone: string | null;
  company: string | null; notes: string | null; tags: string[];
  custom_fields: Record<string, string>; created_at: string;
}

const WhatsAppInbox = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const {
    sendText, sendMedia,
    getProfilePicture, fetchGroupInfo, getContact, updateContact,
    getGroupInviteLink, removeGroupParticipant, promoteGroupParticipant,
    demoteGroupParticipant,
  } = useEvolutionApi();

  // Initialize state from cache
  const inboxCache = getInboxCache();
  const [instances, setInstances] = useState<EvolutionInstance[]>(inboxCache.instances);
  const [selectedInstanceId, setSelectedInstanceId] = useState(inboxCache.selectedInstanceId);
  const [conversations, setConversations] = useState<Conversation[]>(
    inboxCache.selectedInstanceId ? (getCachedConversations(inboxCache.selectedInstanceId) || []) : []
  );
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(!isCacheFresh(inboxCache.selectedInstanceId));
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [profilePics, setProfilePics] = useState<Record<string, string>>(getCachedProfilePics());
  const [profilePictureSupported, setProfilePictureSupported] = useState(true);
  const [groupInfoCache, setGroupInfoCache] = useState<Record<string, GroupInfo>>(getCachedGroupInfoMap());
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [sendingCount, setSendingCount] = useState(0);
  const [contactDetails, setContactDetails] = useState<ContactDetails | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState<Record<string, string>>({});
  const [savingContact, setSavingContact] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const bootstrapCompletedRef = useRef(isCacheFresh(inboxCache.selectedInstanceId));
  const [showBootstrapLoading, setShowBootstrapLoading] = useState(!bootstrapCompletedRef.current);
  const [bootstrapProgress, setBootstrapProgress] = useState(bootstrapCompletedRef.current ? 100 : 12);
  const [bootstrapLabel, setBootstrapLabel] = useState("Conectando instâncias…");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingProfileFetchesRef = useRef<Set<string>>(new Set());
  const profilePicsResolvedRef = useRef<Set<string>>(new Set(Object.keys(getCachedProfilePics())));
  const groupInfoFetchedRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(isCacheFresh(inboxCache.selectedInstanceId));
  const conversationsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationsRefreshInFlightRef = useRef(false);
  const lastMessageAtRef = useRef<string | null>(null);

  const isSending = sendingCount > 0;

  const updateBootstrapProgress = useCallback((progress: number, label?: string) => {
    if (bootstrapCompletedRef.current) return;
    setBootstrapProgress((prev) => Math.max(prev, Math.min(100, progress)));
    if (label) setBootstrapLabel(label);
  }, []);

  const completeBootstrap = useCallback(() => {
    if (bootstrapCompletedRef.current) return;
    bootstrapCompletedRef.current = true;
    setBootstrapProgress(100);
    setBootstrapLabel("Tudo pronto");
    setTimeout(() => setShowBootstrapLoading(false), 180);
  }, []);

  const updateConversationPreview = useCallback((conversationId: string, preview: string, at: string) => {
    setConversations((prev) => prev.map((c) => c.id === conversationId ? { ...c, last_message: preview, last_message_at: at } : c));
    setSelectedConv((prev) => prev?.id === conversationId ? { ...prev, last_message: preview, last_message_at: at } : prev);
  }, []);

  const addOptimisticMessage = useCallback((message: WhatsAppMessage) => { setMessages((prev) => [...prev, message]); }, []);
  const removeOptimisticMessage = useCallback((tempId: string) => { setMessages((prev) => prev.filter((msg) => msg.id !== tempId)); }, []);

  // ── Load instances (direct DB query) ──
  const loadInstances = useCallback(async () => {
    updateBootstrapProgress(20, "Conectando instâncias…");
    try {
      const allInstances = await queryInstances();
      const connected = allInstances.filter((i) => i.status === "connected");
      setInstances(connected);
      setCachedInstances(connected);

      if (connected.length === 0) {
        setSelectedInstanceId("");
        setCachedSelectedInstance("");
        setConversations([]);
        setSelectedConv(null);
        completeBootstrap();
        return;
      }

      setSelectedInstanceId((prev) => {
        if (prev && connected.some((i) => i.id === prev)) return prev;
        const newId = connected[0].id;
        setCachedSelectedInstance(newId);
        return newId;
      });

      updateBootstrapProgress(45, "Carregando conversas…");
    } catch {
      setShowBootstrapLoading(false);
    }
  }, [completeBootstrap, updateBootstrapProgress]);

  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  // ── Fetch conversations (direct DB query, uses cache on mount) ──
  const fetchConversations = useCallback(async (silent = false) => {
    if (!selectedInstanceId) {
      setConversations([]);
      setLoadingConvs(false);
      return;
    }

    const cached = getCachedConversations(selectedInstanceId);
    if (cached && cached.length > 0 && !silent) {
      setConversations(cached);
      setLoadingConvs(false);
      initialLoadDoneRef.current = true;
      updateBootstrapProgress(70, "Sincronizando conversas…");
    }

    if (!silent && !cached?.length) {
      setLoadingConvs(true);
      updateBootstrapProgress(55, "Carregando conversas…");
    }

    try {
      const convs = await queryConversations(selectedInstanceId);
      setConversations(convs);
      setCachedConversations(selectedInstanceId, convs);
      updateBootstrapProgress(88, "Aplicando sincronização inicial…");
      if (!silent) completeBootstrap();
    } catch {
      if (!silent) setShowBootstrapLoading(false);
    } finally {
      setLoadingConvs(false);
      initialLoadDoneRef.current = true;
    }
  }, [selectedInstanceId, completeBootstrap, updateBootstrapProgress]);

  useEffect(() => {
    const cached = getCachedConversations(selectedInstanceId);
    if (!cached?.length) {
      initialLoadDoneRef.current = false;
      bootstrapCompletedRef.current = false;
      setShowBootstrapLoading(true);
      setBootstrapProgress(40);
      setBootstrapLabel("Carregando conversas…");
    }
    groupInfoFetchedRef.current.clear();
    fetchConversations(false);
  }, [fetchConversations, selectedInstanceId]);

  // ── Load messages (direct DB query, use cache for instant render) ──
  useEffect(() => {
    if (!selectedConv) return;

    const cached = getCachedMessages(selectedConv.id);
    if (cached && cached.length > 0) {
      setMessages(cached);
      lastMessageAtRef.current = cached[cached.length - 1]?.created_at || null;
      setLoadingMsgs(false);
    }

    const load = async () => {
      if (!cached?.length) setLoadingMsgs(true);
      try {
        const msgs = await queryMessages(selectedConv.id, 100);
        setMessages(msgs);
        lastMessageAtRef.current = msgs[msgs.length - 1]?.created_at || null;
        setCachedMessages(selectedConv.id, msgs);
      } catch {
        /* UI handles */
      } finally {
        setLoadingMsgs(false);
      }
    };

    load();
  }, [selectedConv?.id]);

  useEffect(() => {
    if (!selectedConv?.id) return;
    markConversationRead(selectedConv.id).catch(() => {});
  }, [selectedConv?.id]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const scheduleSilentConversationsRefresh = useCallback(() => {
    if (conversationsRefreshTimerRef.current) return;

    conversationsRefreshTimerRef.current = setTimeout(async () => {
      conversationsRefreshTimerRef.current = null;
      if (conversationsRefreshInFlightRef.current) return;

      conversationsRefreshInFlightRef.current = true;
      try {
        await fetchConversations(true);
      } finally {
        conversationsRefreshInFlightRef.current = false;
      }
    }, 700);
  }, [fetchConversations]);

  // ── Realtime: conversations (silent refresh, debounced) ──
  useEffect(() => {
    if (!selectedInstanceId) return;

    const ch = supabase
      .channel(`whatsapp-conversations:${selectedInstanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations", filter: `instance_id=eq.${selectedInstanceId}` },
        () => {
          scheduleSilentConversationsRefresh();
        }
      )
      .subscribe();

    return () => {
      if (conversationsRefreshTimerRef.current) {
        clearTimeout(conversationsRefreshTimerRef.current);
        conversationsRefreshTimerRef.current = null;
      }
      supabase.removeChannel(ch);
    };
  }, [selectedInstanceId, scheduleSilentConversationsRefresh]);

  // ── Realtime: messages + lightweight polling fallback ──
  useEffect(() => {
    if (!selectedConv?.id) return;

    const convId = selectedConv.id;
    let cancelled = false;
    let pollDelay = 2500;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const mergeNewMessages = (incoming: WhatsAppMessage[]) => {
      if (!incoming.length) return false;

      let changed = false;
      let mergedCache: WhatsAppMessage[] | null = null;

      setMessages((prev) => {
        const map = new Map<string, WhatsAppMessage>();
        // Index by message_id or id
        for (const msg of prev) {
          map.set(msg.message_id || msg.id, msg);
        }

        // Build a list of optimistic messages for matching
        const optimisticMsgs = prev.filter(
          (m) => m.id.startsWith("temp-") && m.direction === "outbound"
        );

        for (const msg of incoming) {
          const key = msg.message_id || msg.id;
          const existing = map.get(key);

          if (!existing) {
            // Check if this incoming outbound message matches an optimistic one
            // by content + direction + close timestamp (within 30s)
            if (msg.direction === "outbound" && msg.message_id) {
              const matchIdx = optimisticMsgs.findIndex((opt) => {
                if (map.get(opt.id) === undefined) return false; // already removed
                if (opt.content !== msg.content) return false;
                const timeDiff = Math.abs(
                  new Date(msg.created_at).getTime() - new Date(opt.created_at).getTime()
                );
                return timeDiff < 30000;
              });

              if (matchIdx >= 0) {
                const matched = optimisticMsgs[matchIdx];
                map.delete(matched.id); // remove optimistic
                optimisticMsgs.splice(matchIdx, 1);
                map.set(key, msg); // add real
                changed = true;
                continue;
              }
            }

            map.set(key, msg);
            changed = true;
            continue;
          }

          const shouldReplace =
            existing.id.startsWith("temp-") ||
            existing.status !== msg.status ||
            existing.media_url !== msg.media_url ||
            existing.content !== msg.content ||
            existing.created_at !== msg.created_at;

          if (shouldReplace) {
            map.set(key, { ...existing, ...msg });
            changed = true;
          }
        }

        if (!changed) return prev;

        const next = Array.from(map.values()).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        mergedCache = next;
        return next;
      });

      if (changed && mergedCache) {
        setCachedMessages(convId, mergedCache);
      }

      const newest = incoming[incoming.length - 1];
      if (newest?.created_at) {
        lastMessageAtRef.current = newest.created_at;
      }

      return changed;
    };

    const pollForMissedMessages = async () => {
      try {
        const since = lastMessageAtRef.current;
        const delta = since
          ? await queryMessagesSince(convId, since, 150)
          : await queryMessages(convId, 100);

        const hasChanges = mergeNewMessages(delta);
        pollDelay = hasChanges ? 1800 : Math.min(pollDelay + 1200, 12000);
      } catch {
        pollDelay = Math.min(pollDelay + 1500, 12000);
      } finally {
        if (!cancelled) {
          pollTimer = setTimeout(pollForMissedMessages, pollDelay);
        }
      }
    };

    const ch = supabase
      .channel(`conversation:${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `conversation_id=eq.${convId}` },
        (payload) => {
          mergeNewMessages([payload.new as WhatsAppMessage]);
          pollDelay = 1800;
        }
      )
      .subscribe();

    pollTimer = setTimeout(pollForMissedMessages, pollDelay);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      supabase.removeChannel(ch);
    };
  }, [selectedConv?.id]);

  // ── Auto-fetch group info (small parallel batch) ──
  useEffect(() => {
    if (!selectedInstanceId || conversations.length === 0) return;
    const inst = instances.find((i) => i.id === selectedInstanceId);
    if (!inst) return;

    const candidates = conversations
      .slice(0, 18)
      .filter((c) => {
        if (!c.remote_jid.endsWith("@g.us")) return false;
        if (groupInfoFetchedRef.current.has(c.remote_jid)) return false;
        const name = c.contact_name || "";
        return !name || name.startsWith("Grupo ") || /^\d+$/.test(name);
      })
      .slice(0, 3);

    if (candidates.length === 0) return;

    let cancelled = false;
    candidates.forEach((c) => groupInfoFetchedRef.current.add(c.remote_jid));

    const fetchBatch = async () => {
      const results = await Promise.allSettled(
        candidates.map(async (conversation) => {
          const info = await fetchGroupInfo(inst.instance_name, conversation.remote_jid);
          return { conversation, info };
        })
      );

      if (cancelled) return;

      const renamedConversationIds = new Map<string, string>();
      const pictureUpdates: Record<string, string> = {};

      results.forEach((result) => {
        if (result.status !== "fulfilled") return;

        const { conversation, info } = result.value;
        if (!info?.subject) return;

        renamedConversationIds.set(conversation.id, info.subject);

        const groupInfo: GroupInfo = {
          subject: info.subject,
          description: info.description,
          size: info.size,
          pictureUrl: info.pictureUrl,
          participants: info.participants || [],
        };

        setGroupInfoCache((prev) => ({ ...prev, [conversation.remote_jid]: groupInfo }));
        setCachedGroupInfo(conversation.remote_jid, groupInfo);

        if (info.pictureUrl) {
          pictureUpdates[conversation.remote_jid] = info.pictureUrl;
          setCachedProfilePic(conversation.remote_jid, info.pictureUrl);
          profilePicsResolvedRef.current.add(conversation.remote_jid);
        }
      });

      if (renamedConversationIds.size > 0) {
        setConversations((prev) =>
          prev.map((conversation) => {
            const subject = renamedConversationIds.get(conversation.id);
            return subject ? { ...conversation, contact_name: subject } : conversation;
          })
        );

        setSelectedConv((prev) => {
          if (!prev) return prev;
          const subject = renamedConversationIds.get(prev.id);
          return subject ? { ...prev, contact_name: subject } : prev;
        });
      }

      if (Object.keys(pictureUpdates).length > 0) {
        setProfilePics((prev) => ({ ...prev, ...pictureUpdates }));
      }
    };

    const timer = setTimeout(fetchBatch, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedInstanceId, conversations, instances, fetchGroupInfo]);

  // ── Fetch profile pictures (prioritized, batched, non-blocking) ──
  useEffect(() => {
    if (!profilePictureSupported || !selectedInstanceId || conversations.length === 0) return;
    const inst = instances.find((i) => i.id === selectedInstanceId);
    if (!inst) return;

    const prioritized = [
      ...(selectedConv ? [selectedConv] : []),
      ...conversations.slice(0, 24).filter((conversation) => conversation.id !== selectedConv?.id),
    ];

    const queue = prioritized
      .filter(
        (conversation) =>
          !profilePics[conversation.remote_jid] &&
          !pendingProfileFetchesRef.current.has(conversation.remote_jid) &&
          !profilePicsResolvedRef.current.has(conversation.remote_jid)
      )
      .slice(0, 12);

    if (queue.length === 0) return;

    let cancelled = false;
    queue.forEach((conversation) => pendingProfileFetchesRef.current.add(conversation.remote_jid));

    const fetchBatch = async () => {
      const chunkSize = 4;

      for (let i = 0; i < queue.length; i += chunkSize) {
        if (cancelled) return;

        const chunk = queue.slice(i, i + chunkSize);
        const results = await Promise.allSettled(
          chunk.map((conversation) =>
            getProfilePicture(inst.instance_name, conversation.remote_jid).then((data) => ({
              jid: conversation.remote_jid,
              url: data?.profilePictureUrl,
            }))
          )
        );

        if (cancelled) return;

        const updates: Record<string, string> = {};

        for (const result of results) {
          if (result.status !== "fulfilled") {
            const err = result.reason;
            if (String(err?.message || "").includes("Unknown action: get_profile_picture")) {
              setProfilePictureSupported(false);
              return;
            }
            continue;
          }

          const { jid, url } = result.value;
          pendingProfileFetchesRef.current.delete(jid);
          profilePicsResolvedRef.current.add(jid);

          if (url) {
            updates[jid] = url;
            setCachedProfilePic(jid, url);
          }
        }

        if (Object.keys(updates).length > 0) {
          setProfilePics((prev) => ({ ...prev, ...updates }));
        }
      }
    };

    const timer = setTimeout(fetchBatch, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profilePictureSupported, selectedInstanceId, conversations, instances, profilePics, selectedConv?.id, getProfilePicture]);

  // ── Fetch group info when selecting a group conversation ──
  useEffect(() => {
    if (!selectedConv || !selectedConv.remote_jid.endsWith("@g.us")) return;
    if (groupInfoCache[selectedConv.remote_jid]) return;
    const inst = instances.find((i) => i.id === selectedInstanceId);
    if (!inst) return;
    const fetchGI = async () => {
      try {
        const info = await fetchGroupInfo(inst.instance_name, selectedConv.remote_jid);
        if (info?.subject) {
          const gi: GroupInfo = { subject: info.subject, description: info.description, size: info.size, pictureUrl: info.pictureUrl, participants: info.participants || [] };
          setGroupInfoCache((prev) => ({ ...prev, [selectedConv.remote_jid]: gi }));
          setCachedGroupInfo(selectedConv.remote_jid, gi);
          if (info.pictureUrl) { setProfilePics((prev) => ({ ...prev, [selectedConv.remote_jid]: info.pictureUrl })); setCachedProfilePic(selectedConv.remote_jid, info.pictureUrl); }
          setSelectedConv((prev) => prev?.id === selectedConv.id ? { ...prev, contact_name: info.subject } : prev);
        }
      } catch { /* ignore */ }
    };
    fetchGI();
  }, [selectedConv?.id, selectedConv?.remote_jid, groupInfoCache, instances, selectedInstanceId, fetchGroupInfo]);

  // ── Load contact details when panel opens ──
  useEffect(() => {
    if (!showContactPanel || !selectedConv || isGroupJid(selectedConv.remote_jid)) { setContactDetails(null); return; }
    if (!selectedConv.contact_id) { setContactDetails(null); return; }
    const loadContact = async () => {
      try {
        const data = await getContact(selectedConv.contact_id!);
        if (data?.contact) setContactDetails(data.contact);
      } catch { /* ignore */ }
    };
    loadContact();
  }, [showContactPanel, selectedConv?.contact_id, getContact]);

  const isTransientEvolutionError = (err: unknown) => {
    const msg = String((err as { message?: string })?.message || err || "");
    return /WORKER_LIMIT|BOOT_ERROR|503|Failed to send a Request to the Edge Function/i.test(msg);
  };

  const withSingleRetry = async <T,>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (err) {
      if (!isTransientEvolutionError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 900));
      return operation();
    }
  };

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
      id: tempId, tenant_id: selectedConv.tenant_id, conversation_id: selectedConv.id,
      message_id: null, direction: "outbound", content: payloadText, media_url: null,
      media_type: null, media_mime_type: null, media_thumbnail: null, media_width: null, media_height: null,
      status: "pending",
      metadata: { optimistic: true, quotedMessageId: currentReply?.messageId || null, quotedContent: currentReply?.content || null },
      created_at: now,
    };
    addOptimisticMessage(optimisticMessage);
    updateConversationPreview(selectedConv.id, payloadText, now);
    setMessageText("");
    setReplyTarget(null);
    setSendingCount((c) => c + 1);
    try {
      await withSingleRetry(() => sendText(inst.instance_name, selectedConv.remote_jid, payloadText, currentReply?.messageId));
    }
    catch (err: any) {
      removeOptimisticMessage(tempId);
      setMessageText(payloadText);
      toast({ title: "Erro ao enviar", description: err?.message || "Falha no envio", variant: "destructive" });
    }
    finally { setSendingCount((c) => Math.max(0, c - 1)); }
  };

  // ── Send file ──
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedConv) return;
    const inst = instances.find((i) => i.id === selectedConv.instance_id);
    if (!inst) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      if (!dataUrl || typeof dataUrl !== "string") {
        toast({ title: "Erro ao enviar mídia", description: "Arquivo inválido", variant: "destructive" });
        return;
      }

      const mediaPayload = (dataUrl.startsWith("data:") ? dataUrl.split(",").slice(1).join(",") : dataUrl).replace(/\s/g, "");
      if (!mediaPayload) {
        toast({ title: "Erro ao enviar mídia", description: "Não foi possível processar o arquivo", variant: "destructive" });
        return;
      }

      let mediatype = "document";
      if (file.type === "image/webp") mediatype = "sticker";
      else if (file.type.startsWith("image/")) mediatype = "image";
      else if (file.type.startsWith("audio/")) mediatype = "audio";
      else if (file.type.startsWith("video/")) mediatype = "video";

      const labelMap: Record<string, string> = {
        image: file.name,
        audio: "[Áudio]",
        video: "[Vídeo]",
        document: file.name || "[Documento]",
        sticker: "[Sticker]",
      };

      const previewText = labelMap[mediatype] || "[Mídia]";
      const previewMediaUrl = (mediatype === "image" || mediatype === "sticker") ? dataUrl : null;
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
        media_mime_type: file.type || null,
        media_thumbnail: null,
        media_width: null,
        media_height: null,
        status: "pending",
        metadata: { optimistic: true, fileName: file.name },
        created_at: now,
      };

      addOptimisticMessage(optimisticMessage);
      updateConversationPreview(selectedConv.id, previewText, now);
      setSendingCount((c) => c + 1);

      try {
        await withSingleRetry(() => sendMedia(inst.instance_name, selectedConv.remote_jid, mediatype, mediaPayload, undefined, file.name));
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

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.contact_name?.toLowerCase().includes(q) ||
        c.contact_phone?.toLowerCase().includes(q) ||
        c.last_message?.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const getInitials = (name: string | null) => { if (!name) return "?"; return name.split(" ").map((p) => p[0]).join("").substring(0, 2).toUpperCase(); };
  const formatTime = (d: string | null) => { if (!d) return ""; try { return format(new Date(d), "HH:mm"); } catch { return ""; } };
  const formatConvTime = (d: string | null) => {
    if (!d) return "";
    try {
      const date = new Date(d);
      if (Number.isNaN(date.getTime())) return "";

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayDiff = Math.floor((todayStart.getTime() - dateStart.getTime()) / (1000 * 60 * 60 * 24));

      if (dayDiff <= 0) return format(date, "HH:mm");
      if (dayDiff === 1) return "Ontem";
      if (dayDiff === 2) return "Anteontem";
      if (dayDiff <= 7) return "Semana passada";
      return format(date, "dd/MM/yyyy");
    } catch {
      return "";
    }
  };
  const formatDate = (d: string) => { try { const date = new Date(d); const today = new Date(); if (date.toDateString() === today.toDateString()) return formatTime(d); return format(date, "dd/MM/yyyy HH:mm"); } catch { return ""; } };
  const formatFullDate = (d: string) => { try { return format(new Date(d), "dd/MM/yyyy 'às' HH:mm"); } catch { return ""; } };

  const isMediaPlaceholder = (content: string | null) => {
    if (!content) return false;
    const placeholders = ["[Imagem]", "[Áudio]", "[Vídeo]", "[Sticker]", "[Documento]", "[Mídia]"];
    if (placeholders.includes(content)) return true;
    const colonIdx = content.lastIndexOf(": ");
    if (colonIdx > 0) {
      const afterColon = content.substring(colonIdx + 2);
      if (placeholders.includes(afterColon)) return true;
    }
    return false;
  };
  
  // Phone editing state
  const [phoneCountryCode, setPhoneCountryCode] = useState("+55");
  const [phoneCountryOpen, setPhoneCountryOpen] = useState(false);
  
  // Tag create handler via edge function
  const handleCreateTag = async (name: string, color: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      await supabase.functions.invoke("evolution-api", {
        body: { action: "create_tag", name, color },
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* ignore */ }
  };
  const isGroupJid = (jid: string) => jid.endsWith("@g.us");

  const getSenderName = (msg: WhatsAppMessage): string | null => {
    const meta = msg.metadata as Record<string, any> | null;
    if (!meta?.isGroup) return null;
    return meta?.pushName || meta?.senderPhone || null;
  };

  const getSenderPhone = (msg: WhatsAppMessage): string | null => {
    const meta = msg.metadata as Record<string, any> | null;
    return meta?.senderPhone || null;
  };

  const getQuotedInfo = (msg: WhatsAppMessage): { id: string; content: string } | null => {
    const meta = msg.metadata as Record<string, any> | null;
    if (!meta?.quotedMessageId) return null;
    return { id: meta.quotedMessageId, content: meta.quotedContent || "[Mensagem]" };
  };

  const currentGroupInfo = selectedConv ? groupInfoCache[selectedConv.remote_jid] : null;

  // ── Contact editing ──
  const startEditingContact = () => {
    if (!contactDetails) return;
    setPhoneCountryCode(detectCountryCode(contactDetails.phone));
    setContactForm({
      name: contactDetails.name || "",
      email: contactDetails.email || "",
      phone: formatPhoneEdit(contactDetails.phone),
      company: contactDetails.company || "",
      city: contactDetails.custom_fields?.city || "",
      state: contactDetails.custom_fields?.state || "",
      address: contactDetails.custom_fields?.address || "",
      tags: (contactDetails.tags || []).join(","),
    });
    setEditingContact(true);
  };

  const saveContact = async () => {
    if (!contactDetails) return;
    setSavingContact(true);
    try {
      // Build full phone with country code
      const phoneDigits = contactForm.phone.replace(/\D/g, "");
      const countryDigits = phoneCountryCode.replace(/\D/g, "");
      const fullPhone = phoneDigits ? `${countryDigits}${phoneDigits}` : null;
      const tags = contactForm.tags ? contactForm.tags.split(",").filter(Boolean) : contactDetails.tags;
      
      await updateContact(contactDetails.id, {
        name: contactForm.name || contactDetails.name,
        email: contactForm.email || null,
        phone: fullPhone,
        company: contactForm.company || null,
        tags,
        custom_fields: {
          ...contactDetails.custom_fields,
          city: contactForm.city || "",
          state: contactForm.state || "",
          address: contactForm.address || "",
        },
      });
      setContactDetails({ ...contactDetails, name: contactForm.name || contactDetails.name, email: contactForm.email || null, phone: fullPhone, company: contactForm.company || null, tags, custom_fields: { ...contactDetails.custom_fields, city: contactForm.city || "", state: contactForm.state || "", address: contactForm.address || "" } });
      setEditingContact(false);
      toast({ title: "Contato atualizado" });
    } catch (err: any) { toast({ title: "Erro", description: err?.message, variant: "destructive" }); }
    finally { setSavingContact(false); }
  };

  // ── Group actions ──
  const handleGetInviteLink = async () => {
    if (!selectedConv) return;
    const inst = instances.find((i) => i.id === selectedInstanceId);
    if (!inst) return;
    setLoadingInvite(true);
    try {
      const data = await getGroupInviteLink(inst.instance_name, selectedConv.remote_jid);
      if (data?.inviteLink) { setInviteLink(data.inviteLink); navigator.clipboard.writeText(data.inviteLink); toast({ title: "Link copiado!" }); }
      else toast({ title: "Não foi possível gerar o link", variant: "destructive" });
    } catch (err: any) { toast({ title: "Erro", description: err?.message, variant: "destructive" }); }
    finally { setLoadingInvite(false); }
  };

  const handleRemoveParticipant = async (participantJid: string) => {
    if (!selectedConv) return;
    const inst = instances.find((i) => i.id === selectedInstanceId);
    if (!inst) return;
    try {
      await removeGroupParticipant(inst.instance_name, selectedConv.remote_jid, participantJid);
      setGroupInfoCache((prev) => {
        const gi = prev[selectedConv.remote_jid];
        if (!gi) return prev;
        return { ...prev, [selectedConv.remote_jid]: { ...gi, participants: gi.participants.filter((p) => p.id !== participantJid), size: (gi.size || 1) - 1 } };
      });
      toast({ title: "Participante removido" });
    } catch (err: any) { toast({ title: "Erro", description: err?.message, variant: "destructive" }); }
  };

  const handlePromoteParticipant = async (participantJid: string) => {
    if (!selectedConv) return;
    const inst = instances.find((i) => i.id === selectedInstanceId);
    if (!inst) return;
    try {
      await promoteGroupParticipant(inst.instance_name, selectedConv.remote_jid, participantJid);
      setGroupInfoCache((prev) => {
        const gi = prev[selectedConv.remote_jid];
        if (!gi) return prev;
        return { ...prev, [selectedConv.remote_jid]: { ...gi, participants: gi.participants.map((p) => p.id === participantJid ? { ...p, admin: "admin" } : p) } };
      });
      toast({ title: "Participante promovido a admin" });
    } catch (err: any) { toast({ title: "Erro", description: err?.message, variant: "destructive" }); }
  };

  const handleDemoteParticipant = async (participantJid: string) => {
    if (!selectedConv) return;
    const inst = instances.find((i) => i.id === selectedInstanceId);
    if (!inst) return;
    try {
      await demoteGroupParticipant(inst.instance_name, selectedConv.remote_jid, participantJid);
      setGroupInfoCache((prev) => {
        const gi = prev[selectedConv.remote_jid];
        if (!gi) return prev;
        return { ...prev, [selectedConv.remote_jid]: { ...gi, participants: gi.participants.map((p) => p.id === participantJid ? { ...p, admin: null } : p) } };
      });
      toast({ title: "Admin removido do participante" });
    } catch (err: any) { toast({ title: "Erro", description: err?.message, variant: "destructive" }); }
  };

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
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{user?.email?.charAt(0).toUpperCase() ?? "?"}</div>
              <div className="flex-1 truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{user?.email ?? ""}</div>
              <button onClick={signOut} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors group-data-[collapsible=icon]:hidden" title="Sair"><LogOut className="h-4 w-4" /></button>
            </div>
          </SidebarFooter>
        </Sidebar>

        {/* Main area */}
        <div className="relative flex flex-1 overflow-hidden">
          {showBootstrapLoading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/90 px-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-sm">
                <p className="text-sm font-semibold">Carregando conversas</p>
                <p className="mt-1 text-xs text-muted-foreground">{bootstrapLabel}</p>
                <Progress value={bootstrapProgress} className="mt-4 h-2" />
                <p className="mt-2 text-[11px] text-muted-foreground">{Math.round(bootstrapProgress)}%</p>
              </div>
            </div>
          )}

          {/* Conversation list */}
          <div className="flex w-72 flex-col border-r border-border bg-background">
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <div className="flex items-center gap-2">
                <SidebarTrigger className="h-7 w-7" />
                <h2 className="text-sm font-semibold">Conversas</h2>
              </div>
              <div className="flex items-center gap-1">
                <Select value={selectedInstanceId} onValueChange={(v) => { setSelectedInstanceId(v); setCachedSelectedInstance(v); setSelectedConv(null); setMessages([]); const cached = getCachedConversations(v); if (cached) setConversations(cached); }}>
                  <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {instances.map((i) => (<SelectItem key={i.id} value={i.id}>{i.display_name || i.phone_number || "Instância"}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate("/whatsapp/settings")} title="Gerenciar instâncias"><Settings className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div className="p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar conversa…" className="h-7 pl-8 text-xs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
            </div>
            <ScrollArea className="flex-1">
              {loadingConvs && !initialLoadDoneRef.current ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">Carregando conversas…</p>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                  <MessageCircle className="mb-2 h-6 w-6 text-muted-foreground/40" />
                  <p className="text-xs font-medium text-muted-foreground">Nenhuma conversa encontrada</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/60">As conversas aparecerão aqui automaticamente</p>
                </div>
              ) : (
                filteredConversations.map((c) => (
                  <button key={c.id} onClick={() => { setSelectedConv(c); setShowContactPanel(false); setReplyTarget(null); setContactDetails(null); setEditingContact(false); setInviteLink(null); }}
                    className={`flex w-full items-start gap-2.5 border-b border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${selectedConv?.id === c.id ? "bg-muted" : ""}`}>
                    <Avatar className="h-9 w-9 shrink-0">
                      {profilePics[c.remote_jid] && <AvatarImage src={profilePics[c.remote_jid]} alt={c.contact_name || ""} />}
                      <AvatarFallback className="bg-primary/10 text-xs text-primary">
                        {isGroupJid(c.remote_jid) ? <Users className="h-4 w-4" /> : getInitials(c.contact_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-medium">{c.contact_name || c.contact_phone || "Desconhecido"}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{formatConvTime(c.last_message_at)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between">
                        <p className="truncate text-xs text-muted-foreground">{c.last_message || "…"}</p>
                        {c.unread_count > 0 && <Badge className="ml-1 h-4 min-w-[16px] shrink-0 rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{c.unread_count}</Badge>}
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
                        {isGroupJid(selectedConv.remote_jid) ? `Grupo · ${currentGroupInfo?.size || "…"} participantes` : formatPhoneWhatsApp(selectedConv.contact_phone)}
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
                      <p className="text-xs text-muted-foreground">Carregando mensagens…</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <MessageCircle className="mb-2 h-8 w-8 text-muted-foreground/30" />
                      <p className="text-xs font-medium text-muted-foreground">Nenhuma mensagem ainda</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {messages.map((msg) => {
                        const isOutbound = msg.direction === "outbound";
                        const isGrp = isGroupJid(selectedConv.remote_jid);
                        const senderName = getSenderName(msg);
                        const senderPhone = getSenderPhone(msg);
                        const quoted = getQuotedInfo(msg);
                        const currentInstName = instances.find((i) => i.id === selectedConv.instance_id)?.instance_name || "";

                        return (
                          <div key={msg.id} className={`group flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                            {/* Sender avatar for group inbound */}
                            {isGrp && !isOutbound && (
                              <Avatar className="mr-2 mt-1 h-7 w-7 shrink-0">
                                {senderPhone && profilePics[`${senderPhone}@s.whatsapp.net`] && <AvatarImage src={profilePics[`${senderPhone}@s.whatsapp.net`]} />}
                                <AvatarFallback className="bg-muted text-[10px]">
                                  {(senderName || senderPhone || "?").substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div className={`relative max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${isOutbound ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted"} ${msg.id.startsWith("temp-") ? "opacity-70" : ""}`}>
                              {isGrp && !isOutbound && senderName && (
                                <p className={`text-xs font-semibold mb-0.5 ${getSenderColor(senderName)}`}>{senderName}</p>
                              )}
                              {quoted && (
                                <div className={`mb-1.5 rounded-md border-l-2 px-2 py-1 text-[11px] ${isOutbound ? "border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground/80" : "border-primary/40 bg-primary/5 text-muted-foreground"}`}>
                                  <p className="truncate">{quoted.content}</p>
                                </div>
                              )}
                              {msg.media_type && msg.media_type !== "document" && (msg.media_url || msg.message_id) && (
                                <MediaMessage
                                  messageId={msg.message_id}
                                  mediaUrl={msg.media_url}
                                  mediaType={msg.media_type}
                                  content={msg.content}
                                  instanceName={currentInstName}
                                  remoteJid={selectedConv.remote_jid}
                                  isOutbound={isOutbound}
                                />
                              )}
                              {msg.media_type === "document" && (msg.media_url || msg.message_id) && (
                                <MediaMessage
                                  messageId={msg.message_id}
                                  mediaUrl={msg.media_url}
                                  mediaType="document"
                                  content={msg.content}
                                  instanceName={currentInstName}
                                  remoteJid={selectedConv.remote_jid}
                                  isOutbound={isOutbound}
                                />
                              )}
                              {msg.media_type === "document" && !msg.media_url && !msg.message_id && (
                                <div className="mb-1 flex items-center gap-2 rounded bg-background/20 p-2 text-xs"><Paperclip className="h-3.5 w-3.5" /><span>{msg.content || "Documento"}</span></div>
                              )}
                              {msg.content && msg.media_type !== "document" && !isMediaPlaceholder(msg.content) && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                              <p className={`mt-1 text-right text-[10px] ${isOutbound ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{formatDate(msg.created_at)}</p>
                              <button className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1 hover:bg-muted"
                                onClick={() => setReplyTarget({ messageId: msg.message_id || msg.id, content: msg.content || "[Mídia]", senderName: senderName || (isOutbound ? "Você" : selectedConv.contact_name || "") })}
                                title="Responder"><Reply className="h-3.5 w-3.5 text-muted-foreground" /></button>
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
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setReplyTarget(null)}><X className="h-3 w-3" /></Button>
                  </div>
                )}

                {/* Input bar */}
                <div className="border-t border-border px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={handleFileUpload} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { if (!fileInputRef.current) return; fileInputRef.current.accept = "image/*"; fileInputRef.current.click(); fileInputRef.current.accept = "image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"; }}><Image className="h-4 w-4" /></Button>
                    <Input placeholder="Digite uma mensagem…" className="flex-1 h-8" value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendText(); } }} />
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
            <div className="w-80 border-l border-border overflow-hidden flex flex-col bg-background">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h3 className="text-sm font-semibold">
                  {isGroupJid(selectedConv.remote_jid) ? "Detalhes do grupo" : "Contatos"}
                </h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowContactPanel(false)}><X className="h-3.5 w-3.5" /></Button>
              </div>

              <ScrollArea className="flex-1">
                <div className="space-y-4 p-4">
                  {/* Avatar & Name */}
                  <div className="flex flex-col items-center text-center">
                    <Avatar className="mb-2 h-16 w-16">
                      {profilePics[selectedConv.remote_jid] && <AvatarImage src={profilePics[selectedConv.remote_jid]} alt={selectedConv.contact_name || ""} />}
                      <AvatarFallback className="bg-primary/10 text-lg text-primary">
                        {isGroupJid(selectedConv.remote_jid) ? <Users className="h-7 w-7" /> : getInitials(selectedConv.contact_name)}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-sm font-semibold">{selectedConv.contact_name || "Desconhecido"}</p>
                    {/* Created at with icon */}
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Criado {formatFullDate(selectedConv.created_at)}</span>
                    </div>
                  </div>

                  {/* ── GROUP PANEL ── */}
                  {isGroupJid(selectedConv.remote_jid) ? (
                    <>
                      {currentGroupInfo?.description && (
                        <>
                          <Separator />
                          <div>
                            <p className="mb-1 text-xs font-medium">Descrição</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{currentGroupInfo.description}</p>
                          </div>
                        </>
                      )}

                      <Separator />

                      {/* Invite link */}
                      <div>
                        <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleGetInviteLink} disabled={loadingInvite}>
                          {loadingInvite ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Link2 className="mr-1.5 h-3 w-3" />}
                          Gerar link de convite
                        </Button>
                        {inviteLink && (
                          <div className="mt-2 flex items-center gap-1 rounded bg-muted p-2">
                            <p className="flex-1 truncate text-[10px] text-muted-foreground">{inviteLink}</p>
                            <button onClick={() => { navigator.clipboard.writeText(inviteLink); toast({ title: "Copiado!" }); }} className="shrink-0 p-1 hover:bg-accent rounded"><Copy className="h-3 w-3" /></button>
                          </div>
                        )}
                      </div>

                      {/* Participants */}
                      {currentGroupInfo?.participants && currentGroupInfo.participants.length > 0 && (
                        <>
                          <Separator />
                          <div>
                            <p className="mb-2 text-xs font-medium">{currentGroupInfo.participants.length} participantes</p>
                            <div className="space-y-1 max-h-[400px] overflow-y-auto">
                              {currentGroupInfo.participants.map((p, idx) => (
                                <div key={p.id || idx} className="group/p flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/50">
                                  <Avatar className="h-7 w-7 shrink-0">
                                    {p.phone && profilePics[`${p.phone}@s.whatsapp.net`] && <AvatarImage src={profilePics[`${p.phone}@s.whatsapp.net`]} />}
                                    <AvatarFallback className="bg-muted text-[10px]">{(p.phone || "?").slice(-2)}</AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 overflow-hidden">
                                    <p className="text-xs truncate">{p.phone || p.id}</p>
                                  </div>
                                  {p.admin === "admin" && <span title="Admin"><ShieldCheck className="h-3 w-3 text-primary shrink-0" /></span>}
                                  {p.admin === "superadmin" && <span title="Super Admin"><Crown className="h-3 w-3 text-primary shrink-0" /></span>}
                                  {/* Admin actions */}
                                  <div className="hidden group-hover/p:flex items-center gap-0.5 shrink-0">
                                    {!p.admin && (
                                      <button title="Promover a admin" onClick={() => handlePromoteParticipant(p.id)} className="p-0.5 rounded hover:bg-accent"><ChevronUp className="h-3 w-3 text-muted-foreground" /></button>
                                    )}
                                    {p.admin === "admin" && (
                                      <button title="Remover admin" onClick={() => handleDemoteParticipant(p.id)} className="p-0.5 rounded hover:bg-accent"><ChevronUp className="h-3 w-3 text-muted-foreground rotate-180" /></button>
                                    )}
                                    <button title="Remover do grupo" onClick={() => handleRemoveParticipant(p.id)} className="p-0.5 rounded hover:bg-destructive/10"><UserMinus className="h-3 w-3 text-destructive" /></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    /* ── CONTACT PANEL (Chatwoot-style) ── */
                    <>
                      <Separator />

                      {/* Action icons */}
                      <div className="flex items-center justify-center gap-3">
                        <button title="Mensagem" className="flex h-8 w-8 items-center justify-center rounded-md bg-muted hover:bg-accent transition-colors"><MessageCircle className="h-4 w-4 text-muted-foreground" /></button>
                        <button title="Editar" onClick={startEditingContact} className="flex h-8 w-8 items-center justify-center rounded-md bg-muted hover:bg-accent transition-colors"><Edit2 className="h-4 w-4 text-muted-foreground" /></button>
                        <button title="Ligar" className="flex h-8 w-8 items-center justify-center rounded-md bg-muted hover:bg-accent transition-colors"><Phone className="h-4 w-4 text-muted-foreground" /></button>
                      </div>

                      <Separator />

                      {editingContact ? (
                        <div className="space-y-3">
                          <div>
                            <label className="text-[11px] font-medium text-muted-foreground">Nome</label>
                            <Input className="h-7 text-xs mt-0.5" value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-muted-foreground">Email</label>
                            <Input className="h-7 text-xs mt-0.5" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-muted-foreground">Telefone</label>
                            <div className="flex gap-1 mt-0.5">
                              <Popover open={phoneCountryOpen} onOpenChange={setPhoneCountryOpen}>
                                <PopoverTrigger asChild>
                                  <button className="flex items-center gap-0.5 h-7 px-1.5 rounded-md border border-input bg-background text-xs shrink-0 hover:bg-accent">
                                    <span>{COUNTRY_CODES.find(c => c.dial === phoneCountryCode)?.flag || "🇧🇷"}</span>
                                    <span className="text-[10px] text-muted-foreground">{phoneCountryCode}</span>
                                    <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-48 p-1" align="start">
                                  <div className="max-h-48 overflow-y-auto">
                                    {COUNTRY_CODES.map((c) => (
                                      <button key={c.code} onClick={() => { setPhoneCountryCode(c.dial); setPhoneCountryOpen(false); }}
                                        className="flex items-center gap-2 w-full rounded px-2 py-1 text-xs hover:bg-muted">
                                        <span>{c.flag}</span>
                                        <span className="flex-1 text-left">{c.name}</span>
                                        <span className="text-muted-foreground">{c.dial}</span>
                                      </button>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              <Input className="h-7 text-xs flex-1" placeholder="(XX) XXXXX-XXXX" value={contactForm.phone}
                                onChange={(e) => setContactForm((f) => ({ ...f, phone: maskPhoneInput(e.target.value) }))} />
                            </div>
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-muted-foreground">Empresa</label>
                            <Input className="h-7 text-xs mt-0.5" value={contactForm.company} onChange={(e) => setContactForm((f) => ({ ...f, company: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-muted-foreground">Endereço</label>
                            <Input className="h-7 text-xs mt-0.5" value={contactForm.address} onChange={(e) => setContactForm((f) => ({ ...f, address: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-muted-foreground">Estado</label>
                            <Select value={contactForm.state} onValueChange={(v) => setContactForm((f) => ({ ...f, state: v, city: "" }))}>
                              <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue placeholder="Selecione o estado" /></SelectTrigger>
                              <SelectContent>
                                {BRAZIL_STATES.map((s) => (
                                  <SelectItem key={s.uf} value={s.uf}>{s.uf} - {s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-muted-foreground">Cidade</label>
                            <Select value={contactForm.city} onValueChange={(v) => setContactForm((f) => ({ ...f, city: v }))} disabled={!contactForm.state}>
                              <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue placeholder={contactForm.state ? "Selecione a cidade" : "Selecione o estado primeiro"} /></SelectTrigger>
                              <SelectContent>
                                {(BRAZIL_CITIES[contactForm.state] || []).map((city) => (
                                  <SelectItem key={city} value={city}>{city}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-muted-foreground">Tags</label>
                            <div className="mt-0.5">
                              <TagSelector
                                tags={contactForm.tags ? contactForm.tags.split(",").filter(Boolean) : (contactDetails?.tags || [])}
                                onChange={(newTags) => setContactForm((f) => ({ ...f, tags: newTags.join(",") }))}
                                onCreateTag={handleCreateTag}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1 h-7 text-xs" onClick={saveContact} disabled={savingContact}>
                              {savingContact ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />} Salvar
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingContact(false)}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {/* Status */}
                          <div className="flex items-center gap-2 text-xs">
                            <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">{contactDetails?.notes || "Indisponível"}</span>
                          </div>
                          {/* Phone */}
                          <div className="flex items-center gap-2 text-xs">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span>{formatPhoneWhatsApp(selectedConv.contact_phone)}</span>
                          </div>
                          {/* Email */}
                          <div className="flex items-center gap-2 text-xs">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span>{contactDetails?.email || "Indisponível"}</span>
                          </div>
                          {/* Company */}
                          <div className="flex items-center gap-2 text-xs">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span>{contactDetails?.company || "Indisponível"}</span>
                          </div>
                          {/* Location */}
                          {(contactDetails?.custom_fields?.city || contactDetails?.custom_fields?.state) && (
                            <div className="flex items-center gap-2 text-xs">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span>
                                {[
                                  contactDetails.custom_fields.city,
                                  BRAZIL_STATES.find(s => s.uf === contactDetails.custom_fields.state)?.name || contactDetails.custom_fields.state,
                                ].filter(Boolean).join(", ")}
                              </span>
                            </div>
                          )}
                          {/* Tags */}
                          <div className="flex items-start gap-2 text-xs">
                            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                            <TagSelector tags={contactDetails?.tags || []} onChange={() => {}} readOnly />
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <Separator />
                  <div>
                    <p className="mb-1 text-xs font-medium">Instância</p>
                    <p className="text-xs text-muted-foreground">
                      {instances.find((i) => i.id === selectedConv.instance_id)?.display_name || instances.find((i) => i.id === selectedConv.instance_id)?.phone_number || "—"}
                    </p>
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
