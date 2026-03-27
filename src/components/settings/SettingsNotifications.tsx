import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface NotifRow {
  label: string;
  key: string;
  inApp: boolean;
  email: boolean;
}

const CRM_DEFAULTS: NotifRow[] = [
  { label: "Novo lead atribuído a mim", key: "lead_assigned", inApp: true, email: false },
  { label: "Lead movido de estágio", key: "lead_moved", inApp: true, email: false },
  { label: "Venda fechada (ganha ou perdida)", key: "deal_closed", inApp: true, email: true },
  { label: "Tarefa com prazo vencido", key: "task_overdue", inApp: true, email: true },
  { label: "Menção em comentário", key: "mention", inApp: true, email: false },
];

const WA_DEFAULTS: NotifRow[] = [
  { label: "Nova mensagem recebida", key: "wa_new_msg", inApp: true, email: false },
  { label: "Mensagem não respondida há X horas", key: "wa_unanswered", inApp: true, email: false },
  { label: "Nova conversa iniciada", key: "wa_new_conv", inApp: false, email: false },
];

export function SettingsNotifications() {
  const [crmNotifs, setCrmNotifs] = useState(CRM_DEFAULTS);
  const [waNotifs, setWaNotifs] = useState(WA_DEFAULTS);
  const [unansweredHours, setUnansweredHours] = useState("4");
  const [dailySummary, setDailySummary] = useState(false);
  const [summaryTime, setSummaryTime] = useState("08:00");
  const [saving, setSaving] = useState(false);

  const toggleCrm = (key: string, field: "inApp" | "email") => {
    setCrmNotifs((prev) => prev.map((n) => n.key === key ? { ...n, [field]: !n[field] } : n));
  };

  const toggleWa = (key: string, field: "inApp" | "email") => {
    setWaNotifs((prev) => prev.map((n) => n.key === key ? { ...n, [field]: !n[field] } : n));
  };

  const handleSave = async () => {
    setSaving(true);
    // Save to tenant settings in a real implementation
    await new Promise((r) => setTimeout(r, 500));
    setSaving(false);
    toast.success("Preferências de notificação salvas!");
  };

  const NotifTable = ({ rows, toggle }: { rows: NotifRow[]; toggle: (key: string, field: "inApp" | "email") => void }) => (
    <div className="space-y-0 divide-y divide-border">
      <div className="grid grid-cols-[1fr_60px_60px] gap-2 pb-2">
        <span className="text-xs font-medium text-muted-foreground">Evento</span>
        <span className="text-xs font-medium text-muted-foreground text-center">In-app</span>
        <span className="text-xs font-medium text-muted-foreground text-center">E-mail</span>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[1fr_60px_60px] gap-2 py-2.5 items-center">
          <span className="text-sm">{row.label}</span>
          <div className="flex justify-center">
            <Switch checked={row.inApp} onCheckedChange={() => toggle(row.key, "inApp")} />
          </div>
          <div className="flex justify-center">
            <Switch checked={row.email} onCheckedChange={() => toggle(row.key, "email")} />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Notificações</h2>
        <p className="text-sm text-muted-foreground">Configure como deseja ser notificado</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CRM</CardTitle>
        </CardHeader>
        <CardContent>
          <NotifTable rows={crmNotifs} toggle={toggleCrm} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <NotifTable rows={waNotifs} toggle={toggleWa} />
          <div className="flex items-center gap-3 pt-2">
            <Label className="text-sm text-muted-foreground">Horas sem resposta:</Label>
            <Input
              type="number"
              min={1}
              max={72}
              value={unansweredHours}
              onChange={(e) => setUnansweredHours(e.target.value)}
              className="h-8 w-20 text-sm"
            />
            <span className="text-xs text-muted-foreground">horas</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo Diário</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Receber resumo diário por e-mail</p>
              <p className="text-xs text-muted-foreground">Um resumo das atividades do dia anterior</p>
            </div>
            <Switch checked={dailySummary} onCheckedChange={setDailySummary} />
          </div>
          {dailySummary && (
            <div className="flex items-center gap-3">
              <Label className="text-sm">Horário preferido:</Label>
              <Select value={summaryTime} onValueChange={setSummaryTime}>
                <SelectTrigger className="w-28 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["06:00", "07:00", "08:00", "09:00", "10:00"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar preferências
        </Button>
      </div>
    </div>
  );
}
