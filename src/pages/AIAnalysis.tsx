import React, { lazy, Suspense, useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAIAnalysis, type AIAnalysisRun, type AIAnalysisConversation, type AIAnalysisImprovement, type AnalysisSummary } from "@/hooks/use-ai-analysis";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrainCircuit, Building2, Calendar, Loader2, Play } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const AnalysisOverview = lazy(() => import("@/components/ai-analysis/AnalysisOverview"));
const AnalysisConversations = lazy(() => import("@/components/ai-analysis/AnalysisConversations"));
const AnalysisImprovements = lazy(() => import("@/components/ai-analysis/AnalysisImprovements"));
const AIConsultant = lazy(() => import("@/components/ai-analysis/AIConsultant"));
const ScheduleConfig = lazy(() => import("@/components/ai-analysis/ScheduleConfig"));

function TabSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function AIAnalysis() {
  const aiAnalysis = useAIAnalysis();
  const aiAnalysisRef = useRef(aiAnalysis);
  aiAnalysisRef.current = aiAnalysis;

  const { profile } = useAuth();
  const { toast } = useToast();
  const userRole = profile?.role ?? "cliente";
  const isAdmin = ["admin", "super_admin"].includes(userRole);
  const canRunAnalysis = ["admin", "super_admin", "gerente"].includes(userRole);

  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<AIAnalysisRun | null>(null);
  const [conversations, setConversations] = useState<AIAnalysisConversation[]>([]);
  const [improvements, setImprovements] = useState<AIAnalysisImprovement[]>([]);
  const [pollingActive, setPollingActive] = useState(false);
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [showSchedule, setShowSchedule] = useState(false);
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | undefined>(undefined);

  // Load tenant list for admins (runs once)
  useEffect(() => {
    if (!isAdmin) return;
    aiAnalysisRef.current.listTenants().then(({ tenants: list }) => {
      setTenants(list);
      if (list.length > 0) setSelectedTenantId(list[0].id);
    }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const loadAnalysis = useCallback(async (tenantId?: string) => {
    try {
      const result = await aiAnalysisRef.current.getLatestAnalysis(tenantId);
      setRun(result.run);
      setConversations(result.conversations || []);
      setImprovements(result.improvements || []);
      setPollingActive(result.run?.status === "processing");
    } catch (err) {
      console.error("Error loading analysis:", err);
    } finally {
      setLoading(false);
    }
  }, []); // stable — uses ref internally

  // Load when selectedTenantId changes (or on first mount for non-admins)
  useEffect(() => {
    if (isAdmin && !selectedTenantId) return;
    setLoading(true);
    loadAnalysis(selectedTenantId);
  }, [selectedTenantId, isAdmin, loadAnalysis]);

  // Polling when processing
  useEffect(() => {
    if (!pollingActive) return;
    const interval = setInterval(() => loadAnalysis(selectedTenantId), 10000);
    return () => clearInterval(interval);
  }, [pollingActive, selectedTenantId, loadAnalysis]);

  const handleRunAnalysis = async () => {
    setRunningAnalysis(true);
    try {
      await aiAnalysisRef.current.runAnalysis(selectedTenantId);
      toast({ title: "Análise iniciada", description: "A análise está sendo processada..." });
      setPollingActive(true);
      await loadAnalysis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast({
        title: "Erro ao iniciar análise",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setRunningAnalysis(false);
    }
  };

  const isProcessing = run?.status === "processing" || run?.status === "running";
  const summary = run?.summary as AnalysisSummary | null;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b bg-background px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrainCircuit className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">Análise de IA</h1>
              {run && run.status === "completed" && run.period_start && run.period_end && (
                <p className="text-xs text-muted-foreground">
                  Período: {format(new Date(run.period_start), "dd/MM/yyyy", { locale: ptBR })} —{" "}
                  {format(new Date(run.period_end), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              )}
            </div>
          </div>

          {/* Tenant selector for admins */}
          {isAdmin && tenants.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger className="h-8 w-52 text-sm">
                  <SelectValue placeholder="Selecionar cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            {isProcessing && (
              <Badge variant="secondary" className="gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Processando...
              </Badge>
            )}

            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setShowSchedule(true)} className="gap-1.5">
                <Calendar className="h-4 w-4" />
                Agendamento
              </Button>
            )}

            {canRunAnalysis && (
              <Button
                size="sm"
                onClick={handleRunAnalysis}
                disabled={runningAnalysis || isProcessing}
                className="gap-1.5"
              >
                {runningAnalysis || isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Executar Análise
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <TabSkeleton />
          ) : !run || run.status !== "completed" ? (
            <EmptyState isProcessing={isProcessing} canRun={canRunAnalysis} onRun={handleRunAnalysis} runningAnalysis={runningAnalysis} />
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <div className="border-b bg-background px-6">
                <TabsList className="h-10 bg-transparent p-0 gap-0">
                  <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10">
                    Visão Geral
                  </TabsTrigger>
                  <TabsTrigger value="conversations" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10">
                    Conversas ({conversations.length})
                  </TabsTrigger>
                  <TabsTrigger value="improvements" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10">
                    Orientações ({improvements.length})
                  </TabsTrigger>
                  <TabsTrigger value="consultant" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10">
                    Consultor IA
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-auto">
                <Suspense fallback={<TabSkeleton />}>
                  <TabsContent value="overview" className="m-0 h-full">
                    <AnalysisOverview run={run} summary={summary} conversations={conversations} />
                  </TabsContent>
                  <TabsContent value="conversations" className="m-0 h-full">
                    <AnalysisConversations conversations={conversations} />
                  </TabsContent>
                  <TabsContent value="improvements" className="m-0 h-full">
                    <AnalysisImprovements improvements={improvements} />
                  </TabsContent>
                  <TabsContent value="consultant" className="m-0 h-full">
                    <AIConsultant run={run} summary={summary} improvements={improvements} />
                  </TabsContent>
                </Suspense>
              </div>
            </Tabs>
          )}
        </div>
      </div>

      {/* Schedule Modal */}
      {showSchedule && (
        <Suspense fallback={null}>
          <ScheduleConfig open={showSchedule} onClose={() => setShowSchedule(false)} tenantId={selectedTenantId} />
        </Suspense>
      )}
    </AppLayout>
  );
}

function EmptyState({
  isProcessing,
  canRun,
  onRun,
  runningAnalysis,
}: {
  isProcessing: boolean;
  canRun: boolean;
  onRun: () => void;
  runningAnalysis: boolean;
}) {
  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center p-8">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div>
          <h2 className="text-lg font-medium">Análise em andamento</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Estamos processando as conversas. Isso pode levar alguns minutos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center p-8">
      <div className="rounded-full bg-muted p-4">
        <BrainCircuit className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-medium">Nenhuma análise realizada ainda</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {canRun
            ? "Execute uma análise manualmente ou configure o agendamento automático."
            : "Configure o agendamento nas configurações ou solicite ao administrador."}
        </p>
      </div>
      {canRun && (
        <Button onClick={onRun} disabled={runningAnalysis} className="gap-2">
          {runningAnalysis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Executar Primeira Análise
        </Button>
      )}
    </div>
  );
}
