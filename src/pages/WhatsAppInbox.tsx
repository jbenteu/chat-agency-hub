import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useEvolutionApi, type Conversation, type WhatsAppMessage, type EvolutionInstance } from "@/hooks/use-evolution-api";
import { MediaMessage } from "@/components/whatsapp/MediaMessage";

import { ConversationFilters, type ConversationFilter } from "@/components/whatsapp/ConversationFilters";
import { ConversationListItem } from "@/components/whatsapp/ConversationListItem";
import { ChatHeader } from "@/components/whatsapp/ChatHeader";
import { MessageStatusIcon } from "@/components/whatsapp/MessageStatusIcon";
import { DateSeparator, getDateKey } from "@/components/whatsapp/DateSeparator";
import { WhatsAppFormatted } from "@/components/whatsapp/WhatsAppFormatted";
import { MessageContextMenu } from "@/components/whatsapp/MessageContextMenu";
import { ScrollToBottom } from "@/components/whatsapp/ScrollToBottom";
import { EmojiPicker } from "@/components/whatsapp/EmojiPicker";
import { AudioRecorder } from "@/components/whatsapp/AudioRecorder";
import { InfoPanel } from "@/components/whatsapp/InfoPanel";
import { SearchMessages } from "@/components/whatsapp/SearchMessages";
import { NewConversationDialog } from "@/components/whatsapp/NewConversationDialog";
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

import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  MessageCircle, Send, Image, Paperclip, Search, X, Loader2,
  LayoutDashboard, Users, Settings, Shield, LogOut, Reply,
  ChevronDown, RefreshCw, QrCode,
} from "lucide-react";
import { format } from "date-fns";
import logo from "@/assets/logo.png";

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

// ContactDetails type moved to InfoPanel

const WhatsAppInbox = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const {
    sendText, sendMedia, sendReaction, deleteMessage, archiveConversation, pinConversation,
    getProfilePicture, fetchGroupInfo,
    createInstance, getQrCode, getConnectionStatus, deleteInstance,
    loading: evoLoading,
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
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>("all");
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [sendingCount, setSendingCount] = useState(0);
  // (Contact details, editing, invite link now managed by InfoPanel)
  // Setup flow state (no instances)
  const [setupDisplayName, setSetupDisplayName] = useState("");
  const [setupQrCode, setSetupQrCode] = useState<string | null>(null);
  const [setupInstanceName, setSetupInstanceName] = useState<string | null>(null);
  const [setupCreating, setSetupCreating] = useState(false);
  const setupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hasNoInstances, setHasNoInstances] = useState(false);

  const bootstrapCompletedRef = useRef(isCacheFresh(inboxCache.selectedInstanceId));
  const [showBootstrapLoading, setShowBootstrapLoading] = useState(!bootstrapCompletedRef.current);
  const [bootstrapProgress, setBootstrapProgress] = useState(bootstrapCompletedRef.current ? 100 : 12);
  const [bootstrapLabel, setBootstrapLabel] = useState("Conectando…");

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
    updateBootstrapProgress(20, "Conectando…");
    try {
      const allInstances = await queryInstances();
      const connected = allInstances.filter((i) => i.status === "connected");
      setInstances(connected);
      setCachedInstances(connected);

      if (connected.length === 0 && allInstances.length === 0) {
        setHasNoInstances(true);
        setSelectedInstanceId("");
        setCachedSelectedInstance("");
        setConversations([]);
        setSelectedConv(null);
        completeBootstrap();
        return;
      }

      setHasNoInstances(false);

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
      // Seed profile pics from DB-stored profile_picture_url
      const picUpdates: Record<string, string> = {};
      for (const c of convs) {
        if (c.profile_picture_url && !profilePicsResolvedRef.current.has(c.remote_jid)) {
          picUpdates[c.remote_jid] = c.profile_picture_url;
          setCachedProfilePic(c.remote_jid, c.profile_picture_url);
          profilePicsResolvedRef.current.add(c.remote_jid);
        }
      }
      if (Object.keys(picUpdates).length > 0) {
        setProfilePics((prev) => ({ ...prev, ...picUpdates }));
      }
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
        // Preserve insertion order via index for stable sorting
        const orderMap = new Map<string, number>();
        let idx = 0;
        for (const msg of prev) {
          const key = msg.message_id || msg.id;
          map.set(key, msg);
          orderMap.set(key, idx++);
        }

        const optimisticMsgs = prev.filter(
          (m) => m.id.startsWith("temp-") && m.direction === "outbound"
        );

        for (const msg of incoming) {
          const key = msg.message_id || msg.id;
          const existing = map.get(key);

          if (!existing) {
            if (msg.direction === "outbound" && msg.message_id) {
              const matchIdx = optimisticMsgs.findIndex((opt) => {
                if (map.get(opt.id) === undefined) return false;
                if (opt.content !== msg.content) return false;
                const timeDiff = Math.abs(
                  new Date(msg.created_at).getTime() - new Date(opt.created_at).getTime()
                );
                return timeDiff < 30000;
              });

              if (matchIdx >= 0) {
                const matched = optimisticMsgs[matchIdx];
                const sortPos = orderMap.get(matched.id);
                map.delete(matched.id);
                orderMap.delete(matched.id);
                optimisticMsgs.splice(matchIdx, 1);
                map.set(key, msg);
                if (sortPos !== undefined) orderMap.set(key, sortPos);
                else orderMap.set(key, idx++);
                changed = true;
                continue;
              }
            }

            map.set(key, msg);
            orderMap.set(key, idx++);
            changed = true;
            continue;
          }

          const statusChanged = existing.status !== msg.status;
          const mediaChanged = existing.media_url !== msg.media_url;
          const contentChanged = existing.content !== msg.content;
          const metaChanged = JSON.stringify(existing.metadata) !== JSON.stringify(msg.metadata);
          const isTemp = existing.id.startsWith("temp-");

          if (isTemp || statusChanged || mediaChanged || contentChanged || metaChanged) {
            map.set(key, { ...existing, ...msg });
            changed = true;
          }
        }

        if (!changed) return prev;

        const next = Array.from(map.entries())
          .sort(([keyA, a], [keyB, b]) => {
            const orderA = orderMap.get(keyA);
            const orderB = orderMap.get(keyB);
            if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
            if (orderA !== undefined) return -1;
            if (orderB !== undefined) return 1;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          })
          .map(([, msg]) => msg);
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

    let pollCount = 0;

    const pollForMissedMessages = async () => {
      try {
        pollCount++;
        // Every 2nd poll, do a FULL re-fetch to catch status updates
        // (status changes don't update created_at, so "since" queries miss them)
        const useFullRefresh = pollCount % 2 === 0;
        const since = lastMessageAtRef.current;

        const delta = (!since || useFullRefresh)
          ? await queryMessages(convId, 100)
          : await queryMessagesSince(convId, since, 150);

        const hasChanges = mergeNewMessages(delta);
        pollDelay = hasChanges ? 1500 : Math.min(pollDelay + 800, 8000);
      } catch {
        pollDelay = Math.min(pollDelay + 1500, 10000);
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
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_messages", filter: `conversation_id=eq.${convId}` },
        (payload) => {
          mergeNewMessages([payload.new as WhatsAppMessage]);
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

  // Contact details loading moved to InfoPanel

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
    if (!inst) { toast({ title: "Erro", description: "Conexão não encontrada", variant: "destructive" }); return; }
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
        image: "[Imagem]",
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
        metadata: { optimistic: true, fileName: file.name, quotedMessageId: replyTarget?.messageId || null, quotedContent: replyTarget?.content || null },
        created_at: now,
      };

      const currentReplyForMedia = replyTarget;
      addOptimisticMessage(optimisticMessage);
      updateConversationPreview(selectedConv.id, previewText, now);
      setReplyTarget(null);
      setSendingCount((c) => c + 1);

      try {
        await withSingleRetry(() => sendMedia(inst.instance_name, selectedConv.remote_jid, mediatype, mediaPayload, undefined, file.name, currentReplyForMedia?.messageId));
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
    let list = conversations;

    // Apply filter tab
    if (conversationFilter === "unread") {
      list = list.filter((c) => c.unread_count > 0);
    } else if (conversationFilter === "groups") {
      list = list.filter((c) => c.remote_jid.endsWith("@g.us"));
    } else if (conversationFilter === "archived") {
      list = list.filter((c) => c.archived);
    } else {
      // "all" — hide archived
      list = list.filter((c) => !c.archived);
    }

    // Apply search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.contact_name?.toLowerCase().includes(q) ||
          c.contact_phone?.toLowerCase().includes(q) ||
          c.last_message?.toLowerCase().includes(q)
      );
    }

    // Sort: pinned first, then by last_message_at
    return list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
    });
  }, [conversations, searchQuery, conversationFilter]);

  const totalUnread = useMemo(() =>
    conversations.filter((c) => !c.archived && c.unread_count > 0).length,
    [conversations]
  );

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
  

  const isMediaPlaceholder = (content: string | null) => {
    if (!content) return false;
    const placeholders = ["[Imagem]", "[Áudio]", "[Vídeo]", "[Sticker]", "[Documento]", "[Mídia]", "[Localização]"];
    if (placeholders.includes(content)) return true;
    const colonIdx = content.lastIndexOf(": ");
    if (colonIdx > 0) {
      const afterColon = content.substring(colonIdx + 2);
      if (placeholders.includes(afterColon)) return true;
    }
    // Detect filenames (e.g., "photo.png", "doc.pdf")
    if (/^[^\s]+\.\w{2,5}$/.test(content.trim())) return true;
    return false;
  };
  
  // Phone editing state moved to InfoPanel

  // Inline contact rename state
  const [inlineEditingName, setInlineEditingName] = useState(false);
  const [inlineNameValue, setInlineNameValue] = useState("");
  const inlineNameInputRef = useRef<HTMLInputElement>(null);

  const startInlineRename = () => {
    if (!selectedConv) return;
    setInlineNameValue(selectedConv.contact_name || "");
    setInlineEditingName(true);
    setTimeout(() => inlineNameInputRef.current?.focus(), 50);
  };

  const saveInlineRename = async () => {
    if (!selectedConv || !inlineNameValue.trim()) { setInlineEditingName(false); return; }
    await saveInlineRenameWith(inlineNameValue.trim());
    setInlineEditingName(false);
  };

  const saveInlineRenameWith = async (newName: string) => {
    if (!selectedConv || !newName) return;
    try {
      await supabase.from("whatsapp_conversations").update({ contact_name: newName }).eq("id", selectedConv.id);
      setSelectedConv((prev) => prev ? { ...prev, contact_name: newName } : prev);
      setConversations((prev) => prev.map((c) => c.id === selectedConv.id ? { ...c, contact_name: newName } : c));
      toast({ title: "Nome atualizado" });
    } catch { toast({ title: "Erro ao renomear", variant: "destructive" }); }
  };
  
  // Tag create handler moved to InfoPanel
  const isGroupJid = (jid: string) => jid.endsWith("@g.us");

  const getSenderName = (msg: WhatsAppMessage): string | null => {
    const meta = msg.metadata as Record<string, any> | null;
    if (!meta?.isGroup) return null;
    // Never use pushName from outbound messages as contact name source
    if (msg.direction === "outbound") return null;
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

  // Contact editing and group actions moved to InfoPanel

  // ── Setup flow handlers ──
  const handleSetupCreate = async () => {
    const internalName = `inst-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const label = setupDisplayName.trim() || undefined;
    setSetupCreating(true);
    try {
      const data = await createInstance(internalName, label);
      toast({ title: "Conexão criada!", description: "Escaneie o QR Code para conectar." });
      const qr = data.qrcode?.base64;
      if (qr) {
        const normalized = qr.startsWith("data:image") ? qr : `data:image/png;base64,${qr}`;
        setSetupQrCode(normalized);
        setSetupInstanceName(internalName);
      }
      setSetupDisplayName("");
    } catch (err: any) {
      toast({ title: "Erro ao criar conexão", description: err.message, variant: "destructive" });
    } finally {
      setSetupCreating(false);
    }
  };

  const handleSetupRefreshQr = async () => {
    if (!setupInstanceName) return;
    try {
      const data = await getQrCode(setupInstanceName);
      const qr = data.qrcode?.base64 || data.qrcode?.code;
      if (qr) {
        const normalized = qr.startsWith("data:image") ? qr : `data:image/png;base64,${qr}`;
        setSetupQrCode(normalized);
      }
    } catch (err: any) {
      toast({ title: "Erro ao atualizar QR", description: err.message, variant: "destructive" });
    }
  };

  // Poll for connection while setup QR is shown
  useEffect(() => {
    if (!setupInstanceName) {
      if (setupPollRef.current) clearInterval(setupPollRef.current);
      return;
    }
    setupPollRef.current = setInterval(async () => {
      try {
        const data = await getConnectionStatus(setupInstanceName);
        if (data.connected) {
          if (setupPollRef.current) clearInterval(setupPollRef.current);
          setSetupQrCode(null);
          setSetupInstanceName(null);
          setHasNoInstances(false);
          toast({ title: "WhatsApp conectado!", description: "Suas conversas serão carregadas." });
          loadInstances();
        }
      } catch {}
    }, 5000);
    return () => { if (setupPollRef.current) clearInterval(setupPollRef.current); };
  }, [setupInstanceName]);

  // ── Setup view (no instances) ──
  if (hasNoInstances && !showBootstrapLoading) {
    const handleCancelSetup = async () => {
      if (setupInstanceName) {
        try { await deleteInstance(setupInstanceName); } catch {}
      }
      if (setupPollRef.current) clearInterval(setupPollRef.current);
      setSetupQrCode(null);
      setSetupInstanceName(null);
      setSetupCreating(false);
      setSetupDisplayName("");
    };

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <MessageCircle className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Conectar WhatsApp</h1>
            <p className="text-sm text-muted-foreground">
              Crie uma conexão e escaneie o QR Code para começar a receber mensagens.
            </p>
          </div>

          {setupQrCode ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-4">
                <p className="text-sm font-medium">Escaneie o QR Code com o WhatsApp</p>
                <p className="text-xs text-muted-foreground">
                  Abra o WhatsApp → Menu (⋮) → Aparelhos conectados → Conectar aparelho
                </p>
                <div className="rounded-xl border-2 border-border bg-white p-4">
                  <img src={setupQrCode} alt="QR Code WhatsApp" className="h-64 w-64 object-contain" />
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={handleSetupRefreshQr} disabled={evoLoading}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Atualizar QR
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleCancelSetup}>
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Cancelar
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Aguardando leitura do QR Code…
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome da conexão (opcional)</label>
                <Input
                  placeholder="Ex: Atendimento, Vendas, Suporte…"
                  value={setupDisplayName}
                  onChange={(e) => setSetupDisplayName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSetupCreate()}
                />
                <p className="text-xs text-muted-foreground">
                  Um nome amigável para identificar esta conexão.
                </p>
              </div>
              <Button className="w-full" onClick={handleSetupCreate} disabled={setupCreating || evoLoading}>
                {setupCreating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <QrCode className="mr-1.5 h-4 w-4" />}
                {setupCreating ? "Criando…" : "Criar e gerar QR Code"}
              </Button>
            </div>
          )}

          <div className="text-center">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground">
              ← Voltar ao painel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        {/* Compact sidebar */}
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
            <div className="flex items-center gap-2">
              <img src={logo} alt="Advanced Marketing" className="h-8 w-auto" />
              <span className="text-sm font-semibold text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden">Advanced Marketing</span>
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
                    {instances.map((i) => (<SelectItem key={i.id} value={i.id}>{i.display_name || i.phone_number || "Conexão"}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate("/whatsapp/settings")} title="Gerenciar instâncias"><Settings className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div className="space-y-1.5 p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Buscar conversa…" className="h-7 pl-8 text-xs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <ConversationFilters value={conversationFilter} onChange={setConversationFilter} unreadCount={totalUnread} />
            </div>

            {/* Pinned separator */}
            {conversationFilter === "all" && filteredConversations.some((c) => c.pinned) && filteredConversations.some((c) => !c.pinned) && (
              <div className="px-3 pb-0">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  <span>Fixadas</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              </div>
            )}

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
                filteredConversations.map((c, idx) => {
                  // Insert separator between pinned and unpinned
                  const showUnpinnedSep = conversationFilter === "all" && c.pinned === false && idx > 0 && filteredConversations[idx - 1]?.pinned;
                  const isTyping = c.typing_presence === "composing" && c.typing_updated_at && (Date.now() - new Date(c.typing_updated_at).getTime() < 15000);
                  return (
                    <div key={c.id}>
                      {showUnpinnedSep && (
                        <div className="px-3 py-1">
                          <div className="h-px bg-border" />
                        </div>
                      )}
                      <ConversationListItem
                        conversation={c}
                        isSelected={selectedConv?.id === c.id}
                        profilePicUrl={profilePics[c.remote_jid] || c.profile_picture_url || undefined}
                        isTyping={!!isTyping}
                        onClick={() => { setSelectedConv(c); setShowContactPanel(false); setReplyTarget(null); }}
                        formatTime={formatConvTime}
                      />
                    </div>
                  );
                })
              )}
            </ScrollArea>
          </div>

          {/* Chat area */}
          <div className="flex flex-1 flex-col">
            {selectedConv ? (
              <>
                {/* Chat header */}
                <ChatHeader
                  conversation={selectedConv}
                  profilePicUrl={profilePics[selectedConv.remote_jid]}
                  groupInfo={currentGroupInfo}
                  isTyping={selectedConv.typing_presence === "composing" && !!selectedConv.typing_updated_at && (Date.now() - new Date(selectedConv.typing_updated_at).getTime() < 15000)}
                  showContactPanel={showContactPanel}
                  onToggleContactPanel={() => setShowContactPanel((v) => !v)}
                  onRename={(name) => {
                    saveInlineRenameWith(name);
                  }}
                  onArchive={() => {
                    archiveConversation(selectedConv.id, !selectedConv.archived).catch(() => {});
                    setConversations((prev) => prev.map((c) => c.id === selectedConv.id ? { ...c, archived: !c.archived } : c));
                    setSelectedConv((prev) => prev ? { ...prev, archived: !prev.archived } : prev);
                  }}
                  onPin={() => {
                    pinConversation(selectedConv.id, !selectedConv.pinned).catch(() => {});
                    setConversations((prev) => prev.map((c) => c.id === selectedConv.id ? { ...c, pinned: !c.pinned } : c));
                    setSelectedConv((prev) => prev ? { ...prev, pinned: !prev.pinned } : prev);
                  }}
                />

                {/* Messages */}
                <div className="relative flex-1 overflow-hidden">
                  <ScrollArea className="h-full px-4 py-3">
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
                        {(() => {
                          const filtered = messages.filter((msg) => {
                            if (msg.media_type === "reaction") return false;
                            if (msg.content === "[Reação]") return false;
                            return true;
                          });
                          let lastDateKey = "";
                          const currentInstName = instances.find((i) => i.id === selectedConv.instance_id)?.instance_name || "";
                          const isGrp = isGroupJid(selectedConv.remote_jid);

                          return filtered.map((msg) => {
                            const dateKey = getDateKey(msg.created_at);
                            const showDateSep = dateKey !== lastDateKey;
                            lastDateKey = dateKey;

                            const isOutbound = msg.direction === "outbound";
                            const senderName = getSenderName(msg);
                            const senderPhone = getSenderPhone(msg);
                            const quoted = getQuotedInfo(msg);
                            const meta = msg.metadata as Record<string, any> | null;
                            const metadataMimeType = meta?.mimeType || null;
                            const isDeleted = meta?.deleted === true;
                            const reactions = meta?.reactions as Record<string, string> | null;
                            const reactionEntries = reactions ? Object.entries(reactions) : [];
                            const reactionCounts: Record<string, number> = {};
                            for (const [, emoji] of reactionEntries) {
                              reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
                            }

                            const scrollToQuoted = () => {
                              if (!quoted) return;
                              const el = document.querySelector(`[data-message-id="${quoted.id}"]`);
                              if (el) {
                                el.scrollIntoView({ behavior: "smooth", block: "center" });
                                el.classList.add("ring-2", "ring-primary/40");
                                setTimeout(() => el.classList.remove("ring-2", "ring-primary/40"), 2000);
                              }
                            };

                            const handleReact = (emoji: string) => {
                              if (!msg.message_id) return;
                              sendReaction(currentInstName, selectedConv.remote_jid, msg.message_id, emoji).catch(() => {});
                            };

                            const handleDelete = () => {
                              if (!msg.message_id) return;
                              deleteMessage(currentInstName, selectedConv.remote_jid, msg.message_id).catch(() => {});
                            };

                            const bubbleContent = (
                              <div key={msg.id} data-message-id={msg.message_id || msg.id} className={`group flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                                {isGrp && !isOutbound && (
                                  <Avatar className="mr-2 mt-1 h-7 w-7 shrink-0">
                                    {senderPhone && profilePics[`${senderPhone}@s.whatsapp.net`] && <AvatarImage src={profilePics[`${senderPhone}@s.whatsapp.net`]} />}
                                    <AvatarFallback className="bg-muted text-[10px]">
                                      {(senderName || senderPhone || "?").substring(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                                <MessageContextMenu
                                  content={msg.content}
                                  isOutbound={isOutbound}
                                  messageId={msg.message_id}
                                  senderName={senderName || (isOutbound ? "Você" : selectedConv.contact_name || "")}
                                  onReply={() => setReplyTarget({ messageId: msg.message_id || msg.id, content: msg.content || "[Mídia]", senderName: senderName || (isOutbound ? "Você" : selectedConv.contact_name || "") })}
                                  onReact={msg.message_id ? handleReact : undefined}
                                  onDelete={isOutbound && msg.message_id ? handleDelete : undefined}
                                >
                                  <div className={`relative max-w-[70%] rounded-2xl px-3.5 py-2 text-sm transition-shadow ${isOutbound ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted"}`}>
                                    {isGrp && !isOutbound && senderName && (
                                      <p className={`text-xs font-semibold mb-0.5 ${getSenderColor(senderName)}`}>{senderName}</p>
                                    )}
                                    {quoted && (
                                      <div onClick={scrollToQuoted}
                                        className={`mb-1.5 rounded-md border-l-2 px-2 py-1 text-[11px] cursor-pointer hover:opacity-80 ${isOutbound ? "border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground/80" : "border-primary/40 bg-primary/5 text-muted-foreground"}`}>
                                        <p className="truncate">{quoted.content}</p>
                                      </div>
                                    )}
                                    {isDeleted ? (
                                      <p className="italic text-xs opacity-60">🚫 Mensagem apagada</p>
                                    ) : (
                                      <>
                                        {msg.media_type && msg.media_type !== "document" && (msg.media_url || msg.message_id) && (
                                          <MediaMessage messageId={msg.message_id} mediaUrl={msg.media_url} mediaType={msg.media_type} content={msg.content}
                                            instanceName={currentInstName} remoteJid={selectedConv.remote_jid} isOutbound={isOutbound}
                                            mediaThumbnail={msg.media_thumbnail} mediaWidth={msg.media_width} mediaHeight={msg.media_height} metadataMimeType={metadataMimeType} />
                                        )}
                                        {msg.media_type === "document" && (msg.media_url || msg.message_id) && (
                                          <MediaMessage messageId={msg.message_id} mediaUrl={msg.media_url} mediaType="document" content={msg.content}
                                            instanceName={currentInstName} remoteJid={selectedConv.remote_jid} isOutbound={isOutbound} metadataMimeType={metadataMimeType} />
                                        )}
                                        {msg.media_type === "document" && !msg.media_url && !msg.message_id && (
                                          <div className="mb-1 flex items-center gap-2 rounded bg-background/20 p-2 text-xs"><Paperclip className="h-3.5 w-3.5" /><span>{msg.content || "Documento"}</span></div>
                                        )}
                                        {(() => {
                                          if (!msg.content || !msg.content.trim()) return null;
                                          if (isMediaPlaceholder(msg.content)) return null;
                                          if (msg.media_type === "document" && (msg.media_url || msg.message_id)) return null;
                                          if (msg.media_type === "audio") return null;
                                          return <WhatsAppFormatted text={msg.content} />;
                                        })()}
                                      </>
                                    )}
                                    <div className={`mt-1 flex items-center justify-end gap-1 ${isOutbound ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                      <span className="text-[10px]">{formatDate(msg.created_at)}</span>
                                      {isOutbound && (
                                        <span className="inline-flex items-center">
                                          <MessageStatusIcon status={msg.status} isOptimistic={msg.id.startsWith("temp-")} />
                                        </span>
                                      )}
                                    </div>
                                    {reactionEntries.length > 0 && (
                                      <div className={`mt-1 flex flex-wrap gap-1 ${isOutbound ? "-mr-1" : "-ml-1"}`}>
                                        {Object.entries(reactionCounts).map(([emoji, count]) => (
                                          <span key={emoji} className="inline-flex items-center gap-0.5 rounded-full bg-background/80 border border-border/50 px-1.5 py-0.5 text-xs shadow-sm"
                                            title={reactionEntries.filter(([, e]) => e === emoji).map(([phone]) => phone === "me" ? "Você" : phone).join(", ")}>
                                            {emoji}{count > 1 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </MessageContextMenu>
                              </div>
                            );

                            return (
                              <div key={msg.id}>
                                {showDateSep && <DateSeparator date={msg.created_at} />}
                                {bubbleContent}
                              </div>
                            );
                          });
                        })()}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </ScrollArea>
                  <ScrollToBottom
                    visible={showScrollToBottom}
                    onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                  />
                </div>

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
                    <EmojiPicker onSelect={(emoji) => setMessageText((prev) => prev + emoji)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => fileInputRef.current?.click()} title="Anexar arquivo"><Paperclip className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { if (!fileInputRef.current) return; fileInputRef.current.accept = "image/*"; fileInputRef.current.click(); fileInputRef.current.accept = "image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"; }} title="Enviar imagem"><Image className="h-4 w-4" /></Button>
                    <Input placeholder="Digite uma mensagem…" className="flex-1 h-8" value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendText(); } }} />
                    {messageText.trim() ? (
                      <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleSendText} disabled={isSending}>
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    ) : (
                      <AudioRecorder onSend={(base64, mimeType, _duration) => {
                        const inst = instances.find((i) => i.id === selectedConv?.instance_id);
                        if (!inst || !selectedConv) return;
                        const now = new Date().toISOString();
                        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                        const optimisticMessage: WhatsAppMessage = {
                          id: tempId, tenant_id: selectedConv.tenant_id, conversation_id: selectedConv.id,
                          message_id: null, direction: "outbound", content: "[Áudio]", media_url: null,
                          media_type: "audio", media_mime_type: mimeType, media_thumbnail: null,
                          media_width: null, media_height: null, status: "pending",
                          metadata: { optimistic: true }, created_at: now,
                        };
                        addOptimisticMessage(optimisticMessage);
                        updateConversationPreview(selectedConv.id, "[Áudio]", now);
                        setSendingCount((c) => c + 1);
                        sendMedia(inst.instance_name, selectedConv.remote_jid, "audio", base64, undefined, "audio.ogg")
                          .catch((err: any) => {
                            removeOptimisticMessage(tempId);
                            toast({ title: "Erro ao enviar áudio", description: err?.message, variant: "destructive" });
                          })
                          .finally(() => setSendingCount((c) => Math.max(0, c - 1)));
                      }} />
                    )}
                    {messageText.length > 500 && (
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{messageText.length}</span>
                    )}
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
            <InfoPanel
              conversation={selectedConv}
              profilePicUrl={profilePics[selectedConv.remote_jid]}
              profilePics={profilePics}
              groupInfo={currentGroupInfo}
              instanceName={instances.find((i) => i.id === selectedConv.instance_id)?.instance_name || ""}
              messages={messages}
              onClose={() => setShowContactPanel(false)}
            />
          )}
        </div>
      </div>
    </SidebarProvider>
  );
};

export default WhatsAppInbox;
