import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function SettingsVisualization() {
  const [defaultView, setDefaultView] = useState("kanban");
  const [perPage, setPerPage] = useState("25");
  const [groupBy, setGroupBy] = useState("none");
  const [showAvatar, setShowAvatar] = useState(true);
  const [showValue, setShowValue] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [showDate, setShowDate] = useState(false);
  const [compactCards, setCompactCards] = useState(false);
  const [sortBy, setSortBy] = useState("created_at");
  const [saveLastFilter, setSaveLastFilter] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    localStorage.setItem("crm_view_prefs", JSON.stringify({
      defaultView, perPage, groupBy, showAvatar, showValue, showTags,
      showDate, compactCards, sortBy, saveLastFilter,
    }));
    setSaving(false);
    toast.success("Preferências de visualização salvas!");
  };

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
              <Select value={defaultView} onValueChange={setDefaultView}>
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
              <Select value={perPage} onValueChange={setPerPage}>
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
              <Select value={groupBy} onValueChange={setGroupBy}>
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
            { label: "Mostrar foto/avatar no card", checked: showAvatar, onChange: setShowAvatar },
            { label: "Mostrar valor da negociação", checked: showValue, onChange: setShowValue },
            { label: "Mostrar tags no card", checked: showTags, onChange: setShowTags },
            { label: "Mostrar data de criação", checked: showDate, onChange: setShowDate },
            { label: "Compactar cards", checked: compactCards, onChange: setCompactCards },
          ].map(({ label, checked, onChange }) => (
            <div key={label} className="flex items-center justify-between py-1">
              <span className="text-sm">{label}</span>
              <Switch checked={checked} onCheckedChange={onChange} />
            </div>
          ))}
          <Separator />
          <div className="space-y-1.5">
            <Label className="text-xs">Ordenar colunas por</Label>
            <Select value={sortBy} onValueChange={setSortBy}>
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
            <Switch checked={saveLastFilter} onCheckedChange={setSaveLastFilter} />
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
