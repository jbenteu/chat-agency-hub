import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

const DEFAULT_HOURS = DAYS.map((day, i) => ({
  day,
  active: i < 5,
  start: "08:00",
  end: "18:00",
}));

export function SettingsBusinessHours() {
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [autoMessage, setAutoMessage] = useState(false);
  const [message, setMessage] = useState("Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve! 😊");
  const [saving, setSaving] = useState(false);

  const updateDay = (index: number, field: string, value: unknown) => {
    setHours((prev) => prev.map((h, i) => i === index ? { ...h, [field]: value } : h));
  };

  const applyToWeekdays = () => {
    const mon = hours[0];
    setHours((prev) => prev.map((h, i) => i < 5 ? { ...h, start: mon.start, end: mon.end, active: true } : h));
    toast.success("Horário aplicado para dias úteis");
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    setSaving(false);
    toast.success("Horário de atendimento salvo!");
  };

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
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardHeader>
        {enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Fuso horário</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="h-8 text-sm w-full sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "America/Cuiaba", "America/Belem"].map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              {hours.map((h, i) => (
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

      {enabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Mensagem automática fora do horário</CardTitle>
              <Switch checked={autoMessage} onCheckedChange={setAutoMessage} />
            </div>
          </CardHeader>
          {autoMessage && (
            <CardContent className="space-y-3">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[80px] text-sm"
              />
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                <p className="text-sm whitespace-pre-wrap">{message}</p>
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
