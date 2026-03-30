import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Bot, Calendar, DollarSign, Key, History,
  Trash2, CheckCircle2, XCircle, Clock, Archive,
} from "lucide-react";
import { toast } from "sonner";
import { useAIAnalysis, type AISystemSettings, type AIAnalysisRun } from "@/hooks/use-ai-analysis";

const ANTHROPIC_MODELS = [
  { value: "claude-haiku-4-5-20251001", label: "claude-haiku-4-5 (Rápido)" },
  { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6 (Avançado)" },
];

const OPENAI_MODELS = [
  { value: "gpt-4o-mini", label: "gpt-4o-mini (Rápido)" },
  { value: "gpt-4o", label: "gpt-4o (Avançado)" },
];

const DAYS_OF_WEEK = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: String(i).padStart(2, "0"),
}));

const MINUTES = [
  { value: "0", label: "00" },
  { value: "15", label: "15" },
  { value: "30", label: "30" },
  { value: "45", label: "45" },
];

const DEFAULT_SETTINGS: AISystemSettings = {
  provider: "anthropic",
  analysis_model: "claude-haiku-4-5-20251001",
  insights_model: "claude-sonnet-4-6",
  api_key_configured: false,
  avg_ticket_brl: 2500,
  schedule_enabled: false,
  schedule_days: [1, 2, 3, 4, 5],
  schedule_hour: 8,
  schedule_minute: 0,
  schedule_timezone: "America/Sao_Paulo",
  max_history_runs: 10,
  last_run_at: null,
  next_run_at: null,
  allow_manual_triggers: true,
  max_triggers_per_period: 0,
  trigger_period_days: 30,
};

function formatDateBR(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(dateStr));
}

function RunStatusBadge({ status }: { status: AIAnalysisRun["status"] }) {
  if (status === "completed")
    return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle2 className="h-3 w-3 mr-1" />Concluído</Badge>;
  if (status === "error")
    return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Erro</Badge>;
  return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Executando</Badge>;
}

export function AISystemSettingsAdmin() {
  const { getSystemSettings, updateSystemSettings, getAnalysisRuns, deleteRun } = useAIAnalysis();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AISystemSettings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState("");

  const [runs, setRuns] = useState<AIAnalysisRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSettings(); loadRuns(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getSystemSettings();
      setSettings({ ...DEFAULT_SETTINGS, ...data });
    } catch {
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async () => {
    setRunsLoading(true);
    try {
      const result = await getAnalysisRuns();
      setRuns(result.runs || []);
    } catch {
      // silent
    } finally {
      setRunsLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<AISystemSettings> & { api_key?: string } = { ...settings };
      if (apiKey.trim()) payload.api_key = apiKey.trim();

      await updateSystemSettings(payload);
      toast.success("Configurações salvas com sucesso!");
      setApiKey("");
      await loadSettings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRun = async (runId: string) => {
    setDeletingRunId(runId);
    try {
      await deleteRun(runId);
      toast.success("Análise removida.");
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover análise.");
    } finally {
      setDeletingRunId(null);
    }
  };

  const toggleDay = (day: number) => {
    setSettings((prev) => ({
      ...prev,
      schedule_days: prev.schedule_days.includes(day)
        ? prev.schedule_days.filter((d) => d !== day)
        : [...prev.schedule_days, day].sort((a, b) => a - b),
    }));
  };

  const modelsForProvider = settings.provider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Provedor de IA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Provedor de IA
          </CardTitle>
          <CardDescription>
            Configuração global aplicada a todos os clientes. Apenas administradores podem alterar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Provedor</Label>
            <Select
              value={settings.provider}
              onValueChange={(val) =>
                setSettings((prev) => ({
                  ...prev,
                  provider: val as "anthropic" | "openai",
                  analysis_model: val === "anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o-mini",
                  insights_model: val === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Modelo para análise de conversas</Label>
            <Select
              value={settings.analysis_model}
              onValueChange={(val) => setSettings((prev) => ({ ...prev, analysis_model: val }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {modelsForProvider.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Modelo usado para processar cada conversa.</p>
          </div>

          <div className="space-y-2">
            <Label>Modelo para insights estratégicos</Label>
            <Select
              value={settings.insights_model}
              onValueChange={(val) => setSettings((prev) => ({ ...prev, insights_model: val }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {modelsForProvider.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Modelo avançado usado para gerar insights e consultor IA.</p>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <Label>
                Chave de API
                {settings.provider === "openai" && <span className="ml-1 text-destructive">*</span>}
              </Label>
              {settings.api_key_configured && (
                <Badge variant="secondary" className="ml-auto">Salva</Badge>
              )}
            </div>
            <Input
              type="password"
              placeholder={settings.provider === "anthropic" ? "sk-ant-… (opcional)" : "sk-… (obrigatório)"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              {settings.provider === "anthropic"
                ? "Deixe em branco para usar a chave do sistema."
                : "Chave obrigatória para uso do OpenAI."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Ticket Médio */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Ticket Médio
          </CardTitle>
          <CardDescription>
            Valor usado para calcular estimativa de perdas em leads sem resposta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Ticket médio (R$)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">R$</span>
              <Input
                type="number"
                min={0}
                step={1}
                className="pl-9"
                value={settings.avg_ticket_brl}
                onChange={(e) => setSettings((prev) => ({ ...prev, avg_ticket_brl: Number(e.target.value) || 0 }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agendamento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Agendamento de Análise
          </CardTitle>
          <CardDescription>
            Define quando a análise automática será executada para todos os clientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Análise automática</Label>
              <p className="text-xs text-muted-foreground">Ativar execução agendada.</p>
            </div>
            <Switch
              checked={settings.schedule_enabled}
              onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, schedule_enabled: checked }))}
            />
          </div>

          {settings.schedule_enabled && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Dias da semana</Label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS_OF_WEEK.map((day) => {
                    const active = settings.schedule_days.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:border-primary"
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Horário (Brasília)</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(settings.schedule_hour)}
                    onValueChange={(val) => setSettings((prev) => ({ ...prev, schedule_hour: Number(val) }))}
                  >
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HOURS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}h</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">:</span>
                  <Select
                    value={String(settings.schedule_minute)}
                    onValueChange={(val) => setSettings((prev) => ({ ...prev, schedule_minute: Number(val) }))}
                  >
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MINUTES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground font-medium flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />Próxima execução
                  </p>
                  <p className="font-semibold">{formatDateBR(settings.next_run_at)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground font-medium flex items-center gap-1">
                    <History className="h-3.5 w-3.5" />Última execução
                  </p>
                  <p className="font-semibold">{formatDateBR(settings.last_run_at)}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Controle de histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-primary" />
            Controle de Histórico
          </CardTitle>
          <CardDescription>
            Limite de análises salvas por cliente. Ao atingir o limite, a mais antiga é removida automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-xs">
            <Label>Máximo de análises por cliente</Label>
            <Input
              type="number"
              min={1}
              max={50}
              step={1}
              value={settings.max_history_runs}
              onChange={(e) => setSettings((prev) => ({ ...prev, max_history_runs: Number(e.target.value) || 10 }))}
            />
            <p className="text-xs text-muted-foreground">
              Recomendado: entre 5 e 20 análises.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Controle de análises manuais */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Análises Manuais pelos Clientes
          </CardTitle>
          <CardDescription>
            Controle se os clientes podem solicitar análises manuais e com que frequência.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Permitir análise manual</Label>
              <p className="text-xs text-muted-foreground">Gestores e CS podem clicar em "Regenerar" para iniciar uma análise.</p>
            </div>
            <Switch
              checked={settings.allow_manual_triggers}
              onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, allow_manual_triggers: checked }))}
            />
          </div>

          {settings.allow_manual_triggers && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Limite de usos por período</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={settings.max_triggers_per_period}
                    onChange={(e) => setSettings((prev) => ({ ...prev, max_triggers_per_period: Number(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-muted-foreground">0 = sem limite.</p>
                </div>
                <div className="space-y-2">
                  <Label>Período (dias)</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={settings.trigger_period_days}
                    onChange={(e) => setSettings((prev) => ({ ...prev, trigger_period_days: Number(e.target.value) || 30 }))}
                  />
                  <p className="text-xs text-muted-foreground">Janela de tempo para contar usos.</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Botão salvar */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="min-w-36">
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</> : "Salvar configurações"}
        </Button>
      </div>

      {/* Histórico de análises */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="h-5 w-5 text-primary" />
                Histórico de Análises
              </CardTitle>
              <CardDescription>Últimas análises executadas no sistema.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadRuns} disabled={runsLoading}>
              {runsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma análise executada ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-center">Conversas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-sm">{formatDateBR(run.run_at)}</TableCell>
                    <TableCell>
                      <Badge variant={run.triggered_by === "manual" ? "default" : "outline"} className="text-xs">
                        {run.triggered_by === "manual" ? "Manual" : "Agendado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums">
                      {run.conversations_analyzed}
                      {run.conversations_total > 0 && (
                        <span className="text-muted-foreground">/{run.conversations_total}</span>
                      )}
                    </TableCell>
                    <TableCell><RunStatusBadge status={run.status} /></TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            disabled={deletingRunId === run.id}
                          >
                            {deletingRunId === run.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover análise?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta análise de {formatDateBR(run.run_at)} será removida permanentemente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteRun(run.id)}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AISystemSettingsAdmin;
