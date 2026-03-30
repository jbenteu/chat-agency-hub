import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Bot, Calendar, DollarSign, Key } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AIAnalysisSettings } from "@/hooks/use-ai-analysis";

const ANTHROPIC_ANALYSIS_MODELS = [
  { value: "claude-haiku-4-5-20251001", label: "claude-haiku-4-5-20251001 (Rápido)" },
  { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6 (Avançado)" },
];

const OPENAI_ANALYSIS_MODELS = [
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

const DEFAULT_SETTINGS: AIAnalysisSettings = {
  provider: "anthropic",
  analysis_model: "claude-haiku-4-5-20251001",
  insights_model: "claude-sonnet-4-6",
  api_key_configured: false,
  avg_ticket_brl: 500,
  schedule_enabled: false,
  schedule_days: [1, 2, 3, 4, 5],
  schedule_hour: 8,
  schedule_minute: 0,
  schedule_timezone: "America/Sao_Paulo",
  last_run_at: null,
  next_run_at: null,
  max_history_runs: 10,
  allow_manual_triggers: true,
  max_triggers_per_period: 0,
  trigger_period_days: 30,
};

function formatDateBR(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(dateStr));
}

function computeNextRun(settings: AIAnalysisSettings): string {
  if (!settings.schedule_enabled || settings.schedule_days.length === 0) return "—";

  const now = new Date();
  const tz = settings.schedule_timezone || "America/Sao_Paulo";

  // Find the next occurrence
  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + daysAhead);

    // Get day of week in the target timezone
    const dayInTZ = new Date(
      candidate.toLocaleString("en-US", { timeZone: tz })
    ).getDay();

    if (!settings.schedule_days.includes(dayInTZ)) continue;

    const runTime = new Date(
      candidate.toLocaleString("en-US", { timeZone: tz })
    );
    runTime.setHours(settings.schedule_hour, settings.schedule_minute, 0, 0);

    // Convert back to UTC for comparison
    const runTimeUTC = new Date(
      runTime.toLocaleString("en-US", { timeZone: "UTC" })
    );

    if (daysAhead === 0 && runTimeUTC <= now) continue;

    return formatDateBR(runTime.toISOString());
  }

  return "—";
}

export function AIAnalysisSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AIAnalysisSettings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-analysis", {
        body: { action: "get_ai_settings", payload: {} },
      });
      if (error) throw new Error(error.message);
      setSettings({ ...DEFAULT_SETTINGS, ...(data as AIAnalysisSettings) });
    } catch (err) {
      // Settings may not exist yet — use defaults silently
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<AIAnalysisSettings> & { api_key?: string } = { ...settings };
      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }

      const { error } = await supabase.functions.invoke("ai-analysis", {
        body: { action: "update_ai_settings", payload },
      });
      if (error) throw new Error(error.message);

      toast.success("Configurações salvas com sucesso!");
      setApiKey("");
      // Reload to get updated api_key_configured flag
      await loadSettings();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  };

  const modelsForProvider = settings.provider === "anthropic" ? ANTHROPIC_ANALYSIS_MODELS : OPENAI_ANALYSIS_MODELS;

  const toggleDay = (day: number) => {
    setSettings((prev) => ({
      ...prev,
      schedule_days: prev.schedule_days.includes(day)
        ? prev.schedule_days.filter((d) => d !== day)
        : [...prev.schedule_days, day].sort((a, b) => a - b),
    }));
  };

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
    <div className="space-y-6 max-w-2xl">
      {/* Provedor de IA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Provedor de IA
          </CardTitle>
          <CardDescription>
            Escolha o provedor e os modelos usados para análise e geração de insights.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Provider selector */}
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

          {/* Analysis model */}
          <div className="space-y-2">
            <Label>Modelo para análise</Label>
            <Select
              value={settings.analysis_model}
              onValueChange={(val) => setSettings((prev) => ({ ...prev, analysis_model: val }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelsForProvider.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Modelo rápido usado para processar a fila de conversas.
            </p>
          </div>

          {/* Insights model */}
          <div className="space-y-2">
            <Label>Modelo para insights</Label>
            <Select
              value={settings.insights_model}
              onValueChange={(val) => setSettings((prev) => ({ ...prev, insights_model: val }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelsForProvider.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Modelo avançado usado para gerar insights estratégicos.
            </p>
          </div>

          <Separator />

          {/* API Key */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <Label>
                Chave de API
                {settings.provider === "openai" && (
                  <span className="ml-1 text-destructive">*</span>
                )}
              </Label>
              {settings.api_key_configured && (
                <Badge variant="secondary" className="ml-auto">
                  Salva
                </Badge>
              )}
            </div>
            <Input
              type="password"
              placeholder={
                settings.provider === "anthropic"
                  ? "sk-ant-… (opcional)"
                  : "sk-… (obrigatório)"
              }
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
            Valor médio de venda usado para estimar perdas em leads sem resposta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="avg-ticket">Ticket médio (R$)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                R$
              </span>
              <Input
                id="avg-ticket"
                type="number"
                min={0}
                step={1}
                className="pl-9"
                value={settings.avg_ticket_brl}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    avg_ticket_brl: Number(e.target.value) || 0,
                  }))
                }
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
            Execute análises automaticamente em horários programados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Análise automática</Label>
              <p className="text-xs text-muted-foreground">
                Ativar execução agendada de análises.
              </p>
            </div>
            <Switch
              checked={settings.schedule_enabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, schedule_enabled: checked }))
              }
            />
          </div>

          {settings.schedule_enabled && (
            <>
              <Separator />

              {/* Days of week */}
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

              {/* Time */}
              <div className="space-y-2">
                <Label>Horário</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(settings.schedule_hour)}
                    onValueChange={(val) =>
                      setSettings((prev) => ({ ...prev, schedule_hour: Number(val) }))
                    }
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS.map((h) => (
                        <SelectItem key={h.value} value={h.value}>
                          {h.label}h
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">:</span>
                  <Select
                    value={String(settings.schedule_minute)}
                    onValueChange={(val) =>
                      setSettings((prev) => ({ ...prev, schedule_minute: Number(val) }))
                    }
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MINUTES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">(Horário de Brasília)</span>
                </div>
              </div>

              <Separator />

              {/* Next / last run */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground font-medium">Próxima execução</p>
                  <p className="font-semibold">{computeNextRun(settings)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground font-medium">Última execução</p>
                  <p className="font-semibold">{formatDateBR(settings.last_run_at)}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="min-w-32">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Salvando…
            </>
          ) : (
            "Salvar configurações"
          )}
        </Button>
      </div>
    </div>
  );
}

export default AIAnalysisSettings;
