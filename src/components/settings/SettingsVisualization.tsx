import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTenantSettings } from "@/hooks/use-tenant-settings";

interface CrmViewPrefs {
  defaultView: string;
  perPage: string;
  groupBy: string;
  showAvatar: boolean;
  showValue: boolean;
  showTags: boolean;
  showDate: boolean;
  compactCards: boolean;
  sortBy: string;
  saveLastFilter: boolean;
}

const DEFAULTS: CrmViewPrefs = {
  defaultView: "kanban", perPage: "25", groupBy: "none",
  showAvatar: true, showValue: true, showTags: true,
  showDate: false, compactCards: false, sortBy: "created_at", saveLastFilter: true,
};

export function SettingsVisualization() {
  const { settings, isLoading, updateSettings } = useTenantSettings();
  const [prefs, setPrefs] = useState<CrmViewPrefs>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.crm_view) {
      setPrefs({ ...DEFAULTS, ...(settings.crm_view as Partial<CrmViewPrefs>) });
    }
  }, [settings.crm_view]);

  const set = <K extends keyof CrmViewPrefs>(k: K, v: CrmViewPrefs[K]) =>
    setPrefs((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings.mutateAsync({ crm_view: prefs });
      // Also persist to localStorage for quick access by CRM components
      localStorage.setItem("crm_view_prefs", JSON.stringify(prefs));
      toast.success("Preferências de visualização salvas!");
    } catch {
      toast.error("Erro ao salvar preferências");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Visualização</h2>
          <p className="text-sm text-muted-foreground">Personalize como o CRM é exibido</p>
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Visualização</h2>
        <p className="text-sm text-muted-foreground">Personalize como o CRM é exibido</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listagem de Contatos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Visualização padrão</Label>
              <Select value={prefs.defaultView} onValueChange={(v) => set("defaultView", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kanban">Kanban</SelectItem>
                  <SelectItem value="table">Tabela</SelectItem>
                  <SelectItem value="list">Lista</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Registros por página</Label>
              <Select value={prefs.perPage} onValueChange={(v) => set("perPage", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Agrupar por</Label>
              <Select value={prefs.groupBy} onValueChange={(v) => set("groupBy", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  <SelectItem value="stage">Estágio</SelectItem>
                  <SelectItem value="assignee">Responsável</SelectItem>
                  <SelectItem value="tag">Tag</SelectItem>
                  <SelectItem value="origin">Origem</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kanban</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "Mostrar foto/avatar no card", checked: prefs.showAvatar, key: "showAvatar" as const },
            { label: "Mostrar valor da negociação", checked: prefs.showValue, key: "showValue" as const },
            { label: "Mostrar tags no card", checked: prefs.showTags, key: "showTags" as const },
            { label: "Mostrar data de criação", checked: prefs.showDate, key: "showDate" as const },
            { label: "Compactar cards", checked: prefs.compactCards, key: "compactCards" as const },
          ].map(({ label, checked, key }) => (
            <div key={key} className="flex items-center justify-between py-1">
              <span className="text-sm">{label}</span>
              <Switch checked={checked} onCheckedChange={(v) => set(key, v)} />
            </div>
          ))}
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs">Ordenar colunas por</Label>
            <Select value={prefs.sortBy} onValueChange={(v) => set("sortBy", v)}>
              <SelectTrigger className="h-8 text-sm w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Data de criação</SelectItem>
                <SelectItem value="value">Valor</SelectItem>
                <SelectItem value="last_activity">Última atividade</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros e Busca</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm">Salvar último filtro usado</span>
              <p className="text-xs text-muted-foreground">Ao voltar para o CRM, o filtro anterior será aplicado</p>
            </div>
            <Switch checked={prefs.saveLastFilter} onCheckedChange={(v) => set("saveLastFilter", v)} />
          </div>
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
