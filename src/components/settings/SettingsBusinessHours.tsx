import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTenantSettings } from "@/hooks/use-tenant-settings";

const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

interface DayHours { day: string; active: boolean; start: string; end: string; }

interface BusinessHoursPrefs {
  enabled: boolean;
  timezone: string;
  hours: DayHours[];
  autoMessage: boolean;
  message: string;
}

const DEFAULT_HOURS: DayHours[] = DAYS.map((day, i) => ({
  day, active: i < 5, start: "08:00", end: "18:00",
}));

const DEFAULTS: BusinessHoursPrefs = {
  enabled: false,
  timezone: "America/Sao_Paulo",
  hours: DEFAULT_HOURS,
  autoMessage: false,
  message: "Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve! 😊",
};

export function SettingsBusinessHours() {
  const { settings, isLoading, updateSettings } = useTenantSettings();
  const [prefs, setPrefs] = useState<BusinessHoursPrefs>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.business_hours) {
      setPrefs({ ...DEFAULTS, ...(settings.business_hours as Partial<BusinessHoursPrefs>) });
    }
  }, [settings.business_hours]);

  const updateDay = (index: number, field: string, value: unknown) => {
    setPrefs((prev) => ({
      ...prev,
      hours: prev.hours.map((h, i) => i === index ? { ...h, [field]: value } : h),
    }));
  };

  const applyToWeekdays = () => {
    const mon = prefs.hours[0];
    setPrefs((prev) => ({
      ...prev,
      hours: prev.hours.map((h, i) => i < 5 ? { ...h, start: mon.start, end: mon.end, active: true } : h),
    }));
    toast.success("Horário aplicado para dias úteis");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings.mutateAsync({ business_hours: prefs });
      toast.success("Horário de atendimento salvo!");
    } catch {
      toast.error("Erro ao salvar horário");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Horário de Atendimento</h2>
          <p className="text-sm text-muted-foreground">Defina os horários em que sua equipe está disponível</p>
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Horário de Atendimento</h2>
        <p className="text-sm text-muted-foreground">Defina os horários em que sua equipe está disponível</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Usar horário de atendimento</CardTitle>
            <Switch checked={prefs.enabled} onCheckedChange={(v) => setPrefs((p) => ({ ...p, enabled: v }))} />
          </div>
        </CardHeader>
        {prefs.enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Fuso horário</Label>
              <Select value={prefs.timezone} onValueChange={(v) => setPrefs((p) => ({ ...p, timezone: v }))}>
                <SelectTrigger className="h-8 text-sm w-full sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "America/Cuiaba", "America/Belem"].map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              {prefs.hours.map((h, i) => (
                <div key={h.day} className="flex items-center gap-3 py-1.5">
                  <Switch checked={h.active} onCheckedChange={(v) => updateDay(i, "active", v)} />
                  <span className="text-sm w-20 font-medium">{h.day}</span>
                  {h.active ? (
                    <>
                      <Input type="time" value={h.start} onChange={(e) => updateDay(i, "start", e.target.value)} className="h-8 text-sm w-28" />
                      <span className="text-xs text-muted-foreground">até</span>
                      <Input type="time" value={h.end} onChange={(e) => updateDay(i, "end", e.target.value)} className="h-8 text-sm w-28" />
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Fechado</span>
                  )}
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={applyToWeekdays} className="text-xs">
              Aplicar mesmo horário para dias úteis
            </Button>
          </CardContent>
        )}
      </Card>

      {prefs.enabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Mensagem automática fora do horário</CardTitle>
              <Switch checked={prefs.autoMessage} onCheckedChange={(v) => setPrefs((p) => ({ ...p, autoMessage: v }))} />
            </div>
          </CardHeader>
          {prefs.autoMessage && (
            <CardContent className="space-y-3">
              <Textarea
                value={prefs.message}
                onChange={(e) => setPrefs((p) => ({ ...p, message: e.target.value }))}
                className="min-h-[80px] text-sm"
              />
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                <p className="text-sm whitespace-pre-wrap">{prefs.message}</p>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar horário
        </Button>
      </div>
    </div>
  );
}
