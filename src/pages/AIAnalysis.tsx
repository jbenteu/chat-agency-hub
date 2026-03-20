import React, { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAIAnalysis, type AIDashboardData } from "@/hooks/use-ai-analysis";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Copy, MessageCircle, Sparkles, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";

const statusColors: Record<string, string> = {
  quente: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  morno: "bg-amber-500/15 text-amber-700 border-amber-200",
  frio: "bg-slate-400/15 text-slate-600 border-slate-200",
  perdido: "bg-red-500/15 text-red-700 border-red-200",
};

const sentimentoColors: Record<string, string> = {
  positivo: "bg-emerald-500/15 text-emerald-700",
  neutro: "bg-slate-400/15 text-slate-600",
  frustrado: "bg-red-500/15 text-red-700",
};

const scoreColor = (v: number | null) => {
  if (v === null) return "bg-muted";
  if (v >= 7) return "bg-emerald-500";
  if (v >= 5) return "bg-amber-400";
  return "bg-red-500";
};

const scoreTextColor = (v: number | null) => {
  if (v === null) return "text-muted-foreground";
  if (v >= 7) return "text-emerald-700";
  if (v >= 5) return "text-amber-600";
  return "text-red-600";
};

const formatHours = (h: number) => {
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)} dias`;
};

const scoreLabels: Record<string, string> = {
  empatia: "Empatia e cordialidade",
  clareza: "Clareza na oferta",
  velocidade: "Velocidade de resposta",
  followup: "Follow-up após orçamento",
  contorno_objecao: "Contorno de objeções",
  cta: "CTA para fechamento",
  personalizacao: "Personalização",
};

const quickQuestions = [
  "Qual o melhor horário para responder leads?",
  "Quais objeções precisam de mais atenção?",
  "Como está a qualidade geral do atendimento?",
  "Quais produtos têm mais interesse este mês?",
  "O que estamos fazendo bem e o que melhorar?",
];

interface ScoresRow {
  id: string;
  conversation_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  sentimento: string | null;
  produto_interesse: string | null;
  score_qualidade: number | null;
  status_lead: string | null;
  analyzed_at: string;
  score_empatia: number | null;
  score_clareza: number | null;
  score_velocidade: number | null;
  score_followup: number | null;
  score_contorno_objecao: number | null;
  score_cta: number | null;
  score_personalizacao: number | null;
}

const AIAnalysis: React.FC = () => {
  const { getDashboard, generateScript, askAI } = useAIAnalysis();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [dashboardData, setDashboardData] = useState<AIDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [askQuestion, setAskQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [generatingScript, setGeneratingScript] = useState<Record<string, boolean>>({});
  const [generatedScripts, setGeneratedScripts] = useState<Record<string, string>>({});
  const [selectedScript, setSelectedScript] = useState<string | null>(null);
  const [scoresData, setScoresData] = useState<ScoresRow[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [objectionScripts, setObjectionScripts] = useState<string[]>([]);
  const [objectionLoading, setObjectionLoading] = useState(false);

  const loadDashboard = async (force = false) => {
    try {
      setLoading(true);
      const result = await getDashboard(force);
      setDashboardData(result.data);
    } catch (err) {
      toast({
        title: "Erro ao carregar dados",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadScores = async () => {
    try {
      setScoresLoading(true);
      const { data: userRoles } = await supabase.from("user_roles").select("tenant_id").limit(1).single();
      if (!userRoles) return;

      const { data } = await supabase
        .from("ai_conversation_analysis" as any)
        .select("*")
        .eq("tenant_id", userRoles.tenant_id)
        .order("analyzed_at", { ascending: false })
        .limit(30);

      if (!data || data.length === 0) {
        setScoresData([]);
        return;
      }

      const convIds = data.map((d: any) => d.conversation_id);
      const { data: convs } = await supabase
        .from("whatsapp_conversations")
        .select("id, contact_name, contact_phone")
        .in("id", convIds);

      const convMap: Record<string, { contact_name: string | null; contact_phone: string | null }> = {};
      (convs || []).forEach((c: any) => { convMap[c.id] = c; });

      setScoresData(
        data.map((d: any) => ({
          ...d,
          contact_name: convMap[d.conversation_id]?.contact_name || null,
          contact_phone: convMap[d.conversation_id]?.contact_phone || null,
        })),
      );
    } catch {
      // silent
    } finally {
      setScoresLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleAsk = async () => {
    if (!askQuestion.trim()) return;
    try {
      setAskLoading(true);
      setAiAnswer(null);
      const result = await askAI(askQuestion);
      setAiAnswer(result.answer);
    } catch (err) {
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao consultar IA",
        variant: "destructive",
      });
    } finally {
      setAskLoading(false);
    }
  };

  const handleGenerateScript = async (
    leadId: string,
    leadName: string,
    productInterest: string,
    hoursWithoutReply: number,
    lastMessage: string,
    objecao?: string,
  ) => {
    try {
      setGeneratingScript((p) => ({ ...p, [leadId]: true }));
      const result = await generateScript({
        lead_name: leadName,
        product_interest: productInterest,
        hours_without_reply: hoursWithoutReply,
        last_message: lastMessage,
        objecao,
      });
      setGeneratedScripts((p) => ({ ...p, [leadId]: result.script }));
      setSelectedScript(result.script);
    } catch (err) {
      toast({ title: "Erro", description: "Falha ao gerar script", variant: "destructive" });
    } finally {
      setGeneratingScript((p) => ({ ...p, [leadId]: false }));
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!", description: "Texto copiado para a área de transferência" });
  };

  const handleObjectionScripts = async () => {
    if (!dashboardData?.top_objecoes?.length) return;
    try {
      setObjectionLoading(true);
      const top3 = dashboardData.top_objecoes.slice(0, 3);
      const results = await Promise.all(
        top3.map((o) =>
          generateScript({
            lead_name: "Cliente",
            product_interest: "joias",
            hours_without_reply: 24,
            last_message: "",
            objecao: o.objecao_detectada,
          }),
        ),
      );
      setObjectionScripts(results.map((r) => r.script));
    } catch {
      toast({ title: "Erro", description: "Falha ao gerar scripts", variant: "destructive" });
    } finally {
      setObjectionLoading(false);
    }
  };

  const isEmpty =
    !dashboardData ||
    (dashboardData.total_conversas_mes === 0 &&
      !dashboardData.score_medio &&
      dashboardData.leads_sem_resposta_lista.length === 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Análise de IA</h1>
            <p className="text-sm text-muted-foreground">
              Powered by Claude · Atualizado automaticamente
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadDashboard(true)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar dados
          </Button>
        </div>

        {isEmpty && !loading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                Ainda não há conversas analisadas. As análises são geradas automaticamente conforme
                novas mensagens chegam.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="visao-geral" onValueChange={(v) => { if (v === "scores") loadScores(); }}>
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
              <TabsTrigger value="leads-perdidos">Leads Perdidos</TabsTrigger>
              <TabsTrigger value="scores">Scores</TabsTrigger>
              <TabsTrigger value="melhores">Melhores Abordagens</TabsTrigger>
              <TabsTrigger value="objecoes">Objeções</TabsTrigger>
              <TabsTrigger value="perguntar">Perguntar à IA</TabsTrigger>
            </TabsList>

            {/* ── Visão Geral ── */}
            <TabsContent value="visao-geral" className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i}><CardContent className="pt-6"><Skeleton className="h-8 w-20 mb-2" /><Skeleton className="h-4 w-32" /></CardContent></Card>
                  ))
                ) : (
                  <>
                    <MetricCard
                      title="Score de qualidade"
                      value={dashboardData?.score_medio ? `${dashboardData.score_medio.toFixed(1)}/10` : "—"}
                      color={dashboardData?.score_medio ? (dashboardData.score_medio > 7 ? "text-emerald-600" : dashboardData.score_medio >= 5 ? "text-amber-600" : "text-red-600") : undefined}
                    />
                    <MetricCard
                      title="Leads sem resposta"
                      value={String(dashboardData?.leads_sem_resposta ?? 0)}
                      color={(dashboardData?.leads_sem_resposta ?? 0) > 10 ? "text-red-600" : (dashboardData?.leads_sem_resposta ?? 0) >= 5 ? "text-amber-600" : "text-emerald-600"}
                    />
                    <MetricCard title="Conversas este mês" value={String(dashboardData?.total_conversas_mes ?? 0)} />
                    <MetricCard
                      title="Lead mais quente"
                      value={String(dashboardData?.leads_por_status?.quente ?? 0)}
                      color="text-emerald-600"
                    />
                  </>
                )}
              </div>

              {/* Score bars */}
              {!loading && dashboardData?.media_scores && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Scores Médios (30 dias)</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {Object.entries(scoreLabels).map(([key, label]) => {
                      const val = dashboardData.media_scores[key as keyof typeof dashboardData.media_scores];
                      const pct = val ? (val / 10) * 100 : 0;
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <span className="text-sm w-48 shrink-0 text-muted-foreground">{label}</span>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${scoreColor(val)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-sm font-medium w-10 text-right ${scoreTextColor(val)}`}>
                            {val?.toFixed(1) ?? "—"}
                          </span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── Leads Perdidos ── */}
            <TabsContent value="leads-perdidos" className="space-y-3">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
              ) : !dashboardData?.leads_sem_resposta_lista?.length ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum lead sem resposta no momento 🎉</CardContent></Card>
              ) : (
                dashboardData.leads_sem_resposta_lista.map((lead) => (
                  <Card key={lead.id}>
                    <CardContent className="pt-4 pb-4 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{lead.contact_name || lead.contact_phone || "Desconhecido"}</span>
                          {lead.status_lead && (
                            <Badge variant="outline" className={statusColors[lead.status_lead] || ""}>
                              {lead.status_lead}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Sem resposta há {formatHours(lead.horas_sem_resposta)}
                        </span>
                      </div>
                      {lead.last_message && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {lead.last_message.substring(0, 80)}
                          {lead.last_message.length > 80 ? "…" : ""}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {lead.produto_interesse && (
                          <Badge variant="secondary" className="text-xs">Interesse: {lead.produto_interesse}</Badge>
                        )}
                        {lead.objecao_detectada && (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                            Objeção: {lead.objecao_detectada}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => navigate("/whatsapp")}>
                          <MessageCircle className="h-3 w-3 mr-1" /> Ver conversa
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            handleGenerateScript(
                              lead.id,
                              lead.contact_name || "Cliente",
                              lead.produto_interesse || "produto",
                              lead.horas_sem_resposta,
                              lead.last_message || "",
                              lead.objecao_detectada || undefined,
                            )
                          }
                          disabled={generatingScript[lead.id]}
                        >
                          {generatingScript[lead.id] ? (
                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3 mr-1" />
                          )}
                          Gerar reengajamento
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* ── Scores ── */}
            <TabsContent value="scores">
              {scoresLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : scoresData.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhuma análise disponível ainda.</CardContent></Card>
              ) : (
                <Card>
                  <CardContent className="pt-4 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Contato</TableHead>
                          <TableHead>Sentimento</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Analisado em</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scoresData.map((row) => (
                          <React.Fragment key={row.id}>
                            <TableRow
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
                            >
                              <TableCell className="font-medium">{row.contact_name || row.contact_phone || "—"}</TableCell>
                              <TableCell>
                                {row.sentimento && (
                                  <Badge variant="outline" className={sentimentoColors[row.sentimento] || ""}>
                                    {row.sentimento}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">{row.produto_interesse || "—"}</TableCell>
                              <TableCell>
                                <span className={`font-semibold ${scoreTextColor(row.score_qualidade)}`}>
                                  {row.score_qualidade ?? "—"}
                                </span>
                              </TableCell>
                              <TableCell>
                                {row.status_lead && (
                                  <Badge variant="outline" className={statusColors[row.status_lead] || ""}>{row.status_lead}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(row.analyzed_at).toLocaleDateString("pt-BR")}
                              </TableCell>
                            </TableRow>
                            {expandedRow === row.id && (
                              <TableRow>
                                <TableCell colSpan={6} className="bg-muted/30">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-2">
                                    {Object.entries(scoreLabels).map(([key, label]) => {
                                      const scoreKey = `score_${key}` as keyof typeof row;
                                      const val = row[scoreKey] as number | null;
                                      return (
                                        <div key={key} className="text-sm">
                                          <span className="text-muted-foreground">{label}: </span>
                                          <span className={`font-semibold ${scoreTextColor(val)}`}>{val ?? "—"}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── Melhores Abordagens ── */}
            <TabsContent value="melhores">
              {loading ? (
                <Skeleton className="h-48 w-full" />
              ) : !dashboardData?.melhores_abordagens?.length ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhuma abordagem com score alto ainda.</CardContent></Card>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dashboardData.melhores_abordagens.map((item, i) => (
                    <Card key={i}>
                      <CardContent className="pt-4 pb-4 space-y-2 relative">
                        <Badge className="absolute top-3 right-3 bg-emerald-500 text-white">
                          {item.score_qualidade}/10
                        </Badge>
                        <p className="font-medium text-sm">{item.contact_name || "Contato"}</p>
                        {item.produto_interesse && (
                          <Badge variant="secondary" className="text-xs">{item.produto_interesse}</Badge>
                        )}
                        <p className="text-sm text-muted-foreground">{item.resumo || "Sem resumo"}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleGenerateScript(
                              `best-${i}`,
                              item.contact_name || "Cliente",
                              item.produto_interesse || "produto",
                              0,
                              item.resumo || "",
                            )
                          }
                          disabled={generatingScript[`best-${i}`]}
                        >
                          {generatingScript[`best-${i}`] ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                          Usar como modelo
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Objeções ── */}
            <TabsContent value="objecoes" className="space-y-6">
              {loading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <>
                  <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader><CardTitle className="text-base">Top Objeções</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {dashboardData?.top_objecoes?.length ? (
                          (() => {
                            const maxCount = dashboardData.top_objecoes[0]?.count || 1;
                            return dashboardData.top_objecoes.map((o, i) => (
                              <div key={i} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                  <span>{o.objecao_detectada}</span>
                                  <span className="text-muted-foreground">{o.count}</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-amber-400 rounded-full"
                                    style={{ width: `${(o.count / maxCount) * 100}%` }}
                                  />
                                </div>
                              </div>
                            ));
                          })()
                        ) : (
                          <p className="text-sm text-muted-foreground">Sem dados</p>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle className="text-base">Top Produtos</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {dashboardData?.top_produtos?.length ? (
                          (() => {
                            const maxCount = dashboardData.top_produtos[0]?.count || 1;
                            return dashboardData.top_produtos.map((p, i) => (
                              <div key={i} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                  <span>{p.produto_interesse}</span>
                                  <span className="text-muted-foreground">{p.count}</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full"
                                    style={{ width: `${(p.count / maxCount) * 100}%` }}
                                  />
                                </div>
                              </div>
                            ));
                          })()
                        ) : (
                          <p className="text-sm text-muted-foreground">Sem dados</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {dashboardData?.top_objecoes && dashboardData.top_objecoes.length > 0 && (
                    <div className="space-y-4">
                      <Button onClick={handleObjectionScripts} disabled={objectionLoading}>
                        {objectionLoading ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                        Gerar scripts de contorno para as top 3 objeções
                      </Button>
                      {objectionScripts.length > 0 && (
                        <div className="grid md:grid-cols-3 gap-4">
                          {objectionScripts.map((script, i) => (
                            <Card key={i}>
                              <CardHeader className="pb-2">
                                <CardDescription>
                                  {dashboardData.top_objecoes[i]?.objecao_detectada || `Objeção ${i + 1}`}
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                <p className="text-sm whitespace-pre-wrap">{script}</p>
                                <Button size="sm" variant="outline" onClick={() => handleCopy(script)}>
                                  <Copy className="h-3 w-3 mr-1" /> Copiar
                                </Button>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* ── Perguntar à IA ── */}
            <TabsContent value="perguntar" className="space-y-4">
              <Card>
                <CardContent className="pt-4 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {quickQuestions.map((q) => (
                      <button
                        key={q}
                        onClick={() => { setAskQuestion(q); }}
                        className="px-3 py-1.5 text-xs rounded-full bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Ex: Como melhorar a taxa de conversão de leads de noivado?"
                      value={askQuestion}
                      onChange={(e) => setAskQuestion(e.target.value)}
                      className="min-h-[60px]"
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
                    />
                    <Button onClick={handleAsk} disabled={askLoading || !askQuestion.trim()} className="shrink-0">
                      {askLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  {aiAnswer && (
                    <div className="rounded-lg bg-muted/50 p-4 whitespace-pre-wrap text-sm leading-relaxed">
                      {aiAnswer}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Script Modal */}
        <Dialog open={!!selectedScript} onOpenChange={() => setSelectedScript(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Script de Reengajamento</DialogTitle>
            </DialogHeader>
            <div className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-4">
              {selectedScript}
            </div>
            <Button onClick={() => selectedScript && handleCopy(selectedScript)}>
              <Copy className="h-4 w-4 mr-1" /> Copiar
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

const MetricCard: React.FC<{ title: string; value: string; color?: string }> = ({ title, value, color }) => (
  <Card>
    <CardContent className="pt-6">
      <p className={`text-2xl font-semibold ${color || ""}`}>{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{title}</p>
    </CardContent>
  </Card>
);

export default AIAnalysis;
