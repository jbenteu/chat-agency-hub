import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAIAnalysis, type AIAnalysisSchedule } from "@/hooks/use-ai-analysis";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ScheduleConfigProps {
  open: boolean;
  onClose: () => void;
  tenantId?: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

const FREQUENCIES = [
  { value: "daily", label: "Diária" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "monthly", label: "Mensal" },
];

export default function ScheduleConfig({ open, onClose, tenantId }: ScheduleConfigProps) {
  const { getSchedule, updateSchedule } = useAIAnalysis();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<Partial<AIAnalysisSchedule>>({
    enabled: true,
    frequency: "weekly",
    day_of_week: 1,
    time_of_day: "08:00",
    timezone: "America/Sao_Paulo",
  });

  useEffect(() => {
    if (!open) return;
    getSchedule(tenantId)
      .then(({ schedule: s }) => {
        if (s) setSchedule(s);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tenantId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSchedule({
        frequency: schedule.frequency || "weekly",
        day_of_week: schedule.day_of_week ?? 1,
        time_of_day: schedule.time_of_day || "08:00",
        timezone: schedule.timezone || "America/Sao_Paulo",
        enabled: schedule.enabled ?? true,
        tenant_id: tenantId,
      });
      toast({ title: "Agendamento salvo com sucesso" });
      onClose();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast({
        title: "Erro ao salvar agendamento",
        description: err?.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const showDayOfWeek = schedule.frequency === "weekly" || schedule.frequency === "biweekly";

  const nextRunLabel = () => {
    if (!schedule.next_run_at) return null;
    try {
      return format(parseISO(schedule.next_run_at), "EEEE, dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Agendamento de Análise
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label className="text-sm font-medium">Análise automática</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Ativar geração periódica automática</p>
              </div>
              <Switch
                checked={schedule.enabled ?? true}
                onCheckedChange={(v) => setSchedule((s) => ({ ...s, enabled: v }))}
              />
            </div>

            {schedule.enabled && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Frequência</Label>
                  <Select
                    value={schedule.frequency || "weekly"}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onValueChange={(v) => setSchedule((s) => ({ ...s, frequency: v as any }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {showDayOfWeek && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Dia da semana</Label>
                    <Select
                      value={String(schedule.day_of_week ?? 1)}
                      onValueChange={(v) => setSchedule((s) => ({ ...s, day_of_week: Number(v) }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map((d) => (
                          <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Horário
                  </Label>
                  <Input
                    type="time"
                    value={(schedule.time_of_day || "08:00").slice(0, 5)}
                    onChange={(e) => setSchedule((s) => ({ ...s, time_of_day: e.target.value }))}
                    className="h-9"
                  />
                </div>

                {nextRunLabel() && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                    Próxima análise: <span className="font-medium text-foreground">{nextRunLabel()}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
