import React, { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  MessageCircle, Sparkles, TrendingUp, TrendingDown, Minus,
  RefreshCw, Search, Building2, Loader2,
} from "lucide-react";

interface ConversationRow {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number | null;
  profile_picture_url: string | null;
  tenant_id: string;
  tenant_name?: string;
  instance_name?: string;
  // analysis fields
  sentiment_score?: number | null;
  lead_score?: number | null;
  analyzed_at?: string | null;
  analysis_result?: Record<string, any> | null;
}

interface TenantOption {
  id: string;
  name: string;
}

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
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [assignedTenants, setAssignedTenants] = useState<TenantOption[]>([]);

  const [selectedTenant, setSelectedTenant] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSentiment, setFilterSentiment] = useState("all");
  const [filterQualification, setFilterQualification] = useState("all");

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check admin
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "super_admin"] as any[]);
      const isAdmin = !!(roles && roles.length > 0);

      // Assigned tenants
      const { data: assignments } = await supabase
        .from("tenant_assignments")
        .select("tenant_id, tenants(id, name)")
        .eq("manager_id", user.id);

      const tenants: TenantOption[] = (assignments || [])
        .map((a: any) => a.tenants as TenantOption)
        .filter(Boolean);
      setAssignedTenants(tenants);

      const tenantIds = tenants.map(t => t.id);

      // If not admin and no assignments, nothing to show
      if (!isAdmin && tenantIds.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Fetch conversations
      let query = supabase
        .from("whatsapp_conversations")
        .select("id, contact_name, contact_phone, last_message, last_message_at, unread_count, profile_picture_url, tenant_id, tenants(name), whatsapp_instances(display_name, instance_name)")
        .order("last_message_at", { ascending: false })
        .limit(200);

      if (!isAdmin && tenantIds.length > 0) {
        query = query.in("tenant_id", tenantIds);
      }

      const { data: convs } = await query;
      if (!convs || convs.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Fetch analyses
      const convIds = convs.map(c => c.id);
      const { data: analyses } = await supabase
        .from("conversation_ai_analysis")
        .select("conversation_id, sentiment_score, lead_score, analyzed_at, analysis_result")
        .in("conversation_id", convIds)
        .order("analyzed_at", { ascending: false });

      const analysisMap = new Map<string, any>();
      analyses?.forEach(a => {
        if (!analysisMap.has(a.conversation_id)) {
          analysisMap.set(a.conversation_id, a);
        }
      });

      const combined: ConversationRow[] = convs.map((c: any) => {
        const analysis = analysisMap.get(c.id);
        return {
          id: c.id,
          contact_name: c.contact_name,
          contact_phone: c.contact_phone,
          last_message: c.last_message,
          last_message_at: c.last_message_at,
          unread_count: c.unread_count,
          profile_picture_url: c.profile_picture_url,
          tenant_id: c.tenant_id,
          tenant_name: c.tenants?.name,
          instance_name: c.whatsapp_instances?.display_name || c.whatsapp_instances?.instance_name,
          sentiment_score: analysis?.sentiment_score ?? null,
          lead_score: analysis?.lead_score ?? null,
          analyzed_at: analysis?.analyzed_at ?? null,
          analysis_result: analysis?.analysis_result ?? null,
        };
      });

      setConversations(combined);
    } catch (err) {
      console.error("Error loading monitoring data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Filtered list
  const filtered = useMemo(() => {
    return conversations.filter(conv => {
      if (selectedTenant !== "all" && conv.tenant_id !== selectedTenant) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = conv.contact_name?.toLowerCase().includes(q) ||
          conv.contact_phone?.includes(q) ||
          conv.tenant_name?.toLowerCase().includes(q);
        if (!match) return false;
      }

      if (filterSentiment !== "all") {
        const s = conv.sentiment_score ?? 0;
        if (filterSentiment === "positive" && s <= 0.3) return false;
        if (filterSentiment === "neutral" && (s > 0.3 || s < -0.3)) return false;
        if (filterSentiment === "negative" && s >= -0.3) return false;
      }

      if (filterQualification !== "all") {
        const qual = (conv.analysis_result as any)?.qualification_level;
        if (qual !== filterQualification) return false;
      }

      return true;
    });
  }, [conversations, selectedTenant, searchQuery, filterSentiment, filterQualification]);

  // Stats
  const stats = useMemo(() => {
    const total = filtered.length;
    const analyzed = filtered.filter(c => c.analyzed_at).length;
    const hot = filtered.filter(c => (c.analysis_result as any)?.qualification_level === "hot").length;
    const positive = filtered.filter(c => (c.sentiment_score ?? 0) > 0.3 && c.analyzed_at).length;
    return { total, analyzed, hot, positive, pctAnalyzed: total > 0 ? Math.round((analyzed / total) * 100) : 0 };
  }, [filtered]);

  const getSentimentInfo = (score: number | null) => {
    if (score === null || score === undefined) return null;
    if (score > 0.3) return { icon: TrendingUp, color: "text-green-500", label: "Positivo", variant: "default" as const };
    if (score < -0.3) return { icon: TrendingDown, color: "text-red-500", label: "Negativo", variant: "destructive" as const };
    return { icon: Minus, color: "text-yellow-500", label: "Neutro", variant: "secondary" as const };
  };

  const getQualBadge = (level: string | undefined) => {
    if (!level) return null;
    if (level === "hot") return <Badge variant="destructive">Quente</Badge>;
    if (level === "warm") return <Badge variant="default">Morno</Badge>;
    return <Badge variant="secondary">Frio</Badge>;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Monitoramento de Conversas</h1>
            <p className="text-sm text-muted-foreground">Visualize e analise conversas dos clientes atribuídos</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedTenant} onValueChange={setSelectedTenant}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {assignedTenants.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de Conversas</CardTitle>
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{stats.total}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Analisadas</CardTitle>
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{stats.analyzed} <span className="text-sm font-normal text-muted-foreground">({stats.pctAnalyzed}%)</span></p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Leads Quentes</CardTitle>
              <TrendingUp className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{stats.hot}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Sentimento Positivo</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{stats.positive}</p></CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, telefone ou joalheria..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterSentiment} onValueChange={setFilterSentiment}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sentimento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="positive">Positivo</SelectItem>
              <SelectItem value="neutral">Neutro</SelectItem>
              <SelectItem value="negative">Negativo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterQualification} onValueChange={setFilterQualification}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Qualificação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="hot">Quente</SelectItem>
              <SelectItem value="warm">Morno</SelectItem>
              <SelectItem value="cold">Frio</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Card key={i}>
                <CardContent className="flex items-start gap-3 p-4">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-[60%]" />
                    <Skeleton className="h-3 w-[40%]" />
                    <Skeleton className="h-3 w-[80%]" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MessageCircle className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-lg font-medium">Nenhuma conversa encontrada</p>
            <p className="text-sm">Ajuste os filtros ou aguarde novas conversas.</p>
          </div>
        ) : (
         <ScrollArea className="h-[600px]">
            <div className="space-y-2 pr-3">
              {filtered.map(conv => {
                const sentiment = getSentimentInfo(conv.sentiment_score ?? null);
                const qualLevel = (conv.analysis_result as any)?.qualification_level;
                return (
                  <Card key={conv.id} className="cursor-pointer transition-colors hover:bg-accent/50">
                    <CardContent className="flex items-start gap-3 p-4">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={conv.profile_picture_url || undefined} />
                        <AvatarFallback className="text-xs">{getInitials(conv.contact_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">{conv.contact_name || conv.contact_phone || "Desconhecido"}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">{formatRelativeTime(conv.last_message_at)}</span>
                            {(conv.unread_count ?? 0) > 0 && (
                              <Badge variant="destructive" className="text-[10px] h-5 min-w-[20px] justify-center">{conv.unread_count}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Building2 className="h-3 w-3" />
                          <span className="truncate">{conv.tenant_name}</span>
                          {conv.instance_name && <>
                            <span>•</span>
                            <span className="truncate">{conv.instance_name}</span>
                          </>}
                        </div>
                        {conv.last_message && (
                          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">{conv.last_message}</p>
                        )}
                        {/* Analysis badges */}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {conv.analyzed_at ? (
                            <>
                              {sentiment && (
                                <>
                                  <sentiment.icon className={`h-3.5 w-3.5 ${sentiment.color}`} />
                                  <Badge variant={sentiment.variant} className="text-[10px] h-5">{sentiment.label}</Badge>
                                </>
                              )}
                              {getQualBadge(qualLevel)}
                              {conv.lead_score != null && (
                                <Badge variant="outline" className="text-[10px] h-5">Score: {conv.lead_score}</Badge>
                              )}
                            </>
                          ) : (
                            <Button variant="outline" size="sm" className="h-6 text-xs gap-1" disabled>
                              <Sparkles className="h-3 w-3" />
                              Analisar com IA
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </AppLayout>
  );
};

export default ConversationMonitoring;
