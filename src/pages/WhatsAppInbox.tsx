import { useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useEvolutionApi, type Conversation, type WhatsAppMessage, type EvolutionInstance } from "@/hooks/use-evolution-api";
import { AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  MessageCircle,
  Send,
  Image,
  Mic,
  Paperclip,
  Search,
  Phone,
  User,
  Mail,
  Tag,
  X,
  Loader2,
  ChevronRight,
  Plus,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const WhatsAppInbox = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const {
    loading,
    listInstances,
    listConversations,
    listMessages,
    sendText,
    sendMedia,
    getProfilePicture,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profilePics, setProfilePics] = useState<Record<string, string>>({});

  // Load instances
  useEffect(() => {
    const load = async () => {
      try {
        const data = await listInstances();
        const connected = (data.instances || []).filter(
          (i: EvolutionInstance) => i.status === "connected"
        );
        setInstances(connected);
        // Auto-select first connected instance
        if (connected.length > 0 && !selectedInstanceId) {
          setSelectedInstanceId(connected[0].id);
        }
      } catch {}
    };
    load();
  }, []);

  // Load conversations (requires selected instance)
  const fetchConversations = useCallback(async () => {
    if (!selectedInstanceId) {
      setConversations([]);
      setLoadingConvs(false);
      return;
    }
    setLoadingConvs(true);
    try {
      const data = await listConversations(selectedInstanceId);
      setConversations(data.conversations || []);
    } catch {} finally {
      setLoadingConvs(false);
    }
  }, [listConversations, selectedInstanceId]);

  useEffect(() => {
    fetchConversations();
  }, [selectedInstanceId]);

  // Fetch profile pictures for conversations
  useEffect(() => {
    if (conversations.length === 0 || instances.length === 0) return;
    const inst = instances.find((i) => i.id === selectedInstanceId);
    if (!inst) return;

    conversations.forEach((conv) => {
      if (profilePics[conv.remote_jid] || conv.remote_jid.includes("@g.us")) return;
      getProfilePicture(inst.instance_name, conv.remote_jid)
        .then((data) => {
          if (data?.profilePictureUrl) {
            setProfilePics((prev) => ({ ...prev, [conv.remote_jid]: data.profilePictureUrl }));
          }
        })
        .catch(() => {});
    });
  }, [conversations, instances, selectedInstanceId]);

  // Load messages when conversation selected
  useEffect(() => {
    if (!selectedConv) return;
    const load = async () => {
      setLoadingMsgs(true);
      try {
        const data = await listMessages(selectedConv.id);
        setMessages(data.messages || []);
      } catch {} finally {
        setLoadingMsgs(false);
      }
    };
    load();
  }, [selectedConv?.id]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel("whatsapp-messages-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const newMsg = payload.new as WhatsAppMessage;
          if (selectedConv && newMsg.conversation_id === selectedConv.id) {
            setMessages((prev) => [...prev, newMsg]);
          }
          // Refresh conversation list
          fetchConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_conversations" },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConv?.id, fetchConversations]);

  const handleSendText = async () => {
    if (!messageText.trim() || !selectedConv) return;
    const inst = instances.find((i) => i.id === selectedConv.instance_id);
    if (!inst) {
      toast({ title: "Erro", description: "Instância não encontrada", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      await sendText(inst.instance_name, selectedConv.remote_jid, messageText.trim());
      setMessageText("");
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv) return;

    const inst = instances.find((i) => i.id === selectedConv.instance_id);
    if (!inst) return;

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      let mediatype = "document";
      if (file.type.startsWith("image/")) mediatype = "image";
      else if (file.type.startsWith("audio/")) mediatype = "audio";
      else if (file.type.startsWith("video/")) mediatype = "video";

      setSending(true);
      try {
        await sendMedia(
          inst.instance_name,
          selectedConv.remote_jid,
          mediatype,
          base64,
          mediatype === "image" ? file.name : undefined,
          file.name
        );
      } catch (err: any) {
        toast({ title: "Erro ao enviar mídia", description: err.message, variant: "destructive" });
      } finally {
        setSending(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.contact_name?.toLowerCase().includes(q) ||
      c.contact_phone?.toLowerCase().includes(q) ||
      c.last_message?.toLowerCase().includes(q)
    );
  });

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
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
      const d = new Date(dateStr);
      const today = new Date();
      if (d.toDateString() === today.toDateString()) return formatTime(dateStr);
      return format(d, "dd/MM/yyyy HH:mm");
    } catch {
      return "";
    }
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-lg border border-border bg-background">
        {/* Left: Conversation List */}
        <div className="flex w-80 flex-col border-r border-border">
          {/* Header with instance selector */}
          <div className="flex items-center justify-between gap-2 border-b border-border p-3">
            <h2 className="text-sm font-semibold">Conversas</h2>
            <div className="flex items-center gap-1">
              <Select value={selectedInstanceId} onValueChange={(v) => {
                setSelectedInstanceId(v);
                setSelectedConv(null);
              }}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {instances.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.display_name || inst.phone_number || "Instância"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => navigate("/whatsapp/settings")}
                title="Gerenciar instâncias"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa…"
                className="h-8 pl-8 text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Conversation list */}
          <ScrollArea className="flex-1">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <MessageCircle className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Nenhuma conversa</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => {
                    setSelectedConv(conv);
                    setShowContactPanel(false);
                  }}
                  className={`flex w-full items-start gap-3 border-b border-border/50 px-3 py-3 text-left transition-colors hover:bg-muted/50 ${
                    selectedConv?.id === conv.id ? "bg-muted" : ""
                  }`}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {getInitials(conv.contact_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">
                        {conv.contact_name || conv.contact_phone || "Desconhecido"}
                      </p>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.last_message || "…"}
                      </p>
                      {conv.unread_count > 0 && (
                        <Badge className="ml-1 h-5 min-w-[20px] shrink-0 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                          {conv.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Center: Chat Area */}
        <div className="flex flex-1 flex-col">
          {selectedConv ? (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {getInitials(selectedConv.contact_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      {selectedConv.contact_name || selectedConv.contact_phone}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedConv.contact_phone}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowContactPanel(!showContactPanel)}
                >
                  <User className="h-4 w-4" />
                  <ChevronRight className={`h-3 w-3 ml-1 transition-transform ${showContactPanel ? "rotate-180" : ""}`} />
                </Button>
              </div>

              {/* Messages Area */}
              <ScrollArea className="flex-1 px-4 py-3">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <MessageCircle className="mb-2 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">Nenhuma mensagem</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
                            msg.direction === "outbound"
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted rounded-bl-md"
                          }`}
                        >
                          {msg.media_type === "image" && msg.media_url && (
                            <img
                              src={msg.media_url}
                              alt="Imagem"
                              className="mb-1 max-w-full rounded-lg"
                              loading="lazy"
                            />
                          )}
                          {msg.media_type === "audio" && msg.media_url && (
                            <audio controls className="mb-1 max-w-full">
                              <source src={msg.media_url} />
                            </audio>
                          )}
                          {msg.media_type === "document" && (
                            <div className="mb-1 flex items-center gap-2 rounded bg-background/20 p-2 text-xs">
                              <Paperclip className="h-3.5 w-3.5" />
                              {msg.content || "Documento"}
                            </div>
                          )}
                          {msg.content && msg.media_type !== "document" && (
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          )}
                          <p
                            className={`mt-1 text-[10px] text-right ${
                              msg.direction === "outbound"
                                ? "text-primary-foreground/60"
                                : "text-muted-foreground"
                            }`}
                          >
                            {formatDate(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Input Area */}
              <div className="border-t border-border px-4 py-3">
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
                    className="h-9 w-9 shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.accept = "image/*";
                        fileInputRef.current.click();
                        fileInputRef.current.accept = "image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";
                      }
                    }}
                    disabled={sending}
                  >
                    <Image className="h-4 w-4" />
                  </Button>
                  <Input
                    placeholder="Digite uma mensagem…"
                    className="flex-1"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendText();
                      }
                    }}
                    disabled={sending}
                  />
                  <Button
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={handleSendText}
                    disabled={sending || !messageText.trim()}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <MessageCircle className="mb-3 h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">
                Selecione uma conversa
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Escolha uma conversa à esquerda para começar
              </p>
            </div>
          )}
        </div>

        {/* Right: Contact Panel */}
        {showContactPanel && selectedConv && (
          <div className="w-72 border-l border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">Detalhes do contato</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowContactPanel(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-16 w-16 mb-2">
                  <AvatarFallback className="text-lg bg-primary/10 text-primary">
                    {getInitials(selectedConv.contact_name)}
                  </AvatarFallback>
                </Avatar>
                <p className="text-sm font-semibold">
                  {selectedConv.contact_name || "Desconhecido"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedConv.contact_phone}
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{selectedConv.contact_phone || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Status: {selectedConv.status}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  <Badge variant="secondary" className="text-[10px]">
                    Lead WhatsApp
                  </Badge>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-xs font-medium mb-1">Instância</p>
                <p className="text-xs text-muted-foreground">
                  {instances.find((i) => i.id === selectedConv.instance_id)?.display_name ||
                    instances.find((i) => i.id === selectedConv.instance_id)?.phone_number ||
                    "—"}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium mb-1">Primeira mensagem</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(selectedConv.created_at)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default WhatsAppInbox;
