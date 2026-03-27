import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sun, Moon, Monitor } from "lucide-react";
import { toast } from "sonner";

const THEME_OPTIONS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

const PRIMARY_COLORS = [
  { value: "blue", color: "#3B82F6" },
  { value: "indigo", color: "#6366F1" },
  { value: "purple", color: "#8B5CF6" },
  { value: "pink", color: "#EC4899" },
  { value: "red", color: "#EF4444" },
  { value: "orange", color: "#F97316" },
  { value: "green", color: "#22C55E" },
  { value: "teal", color: "#14B8A6" },
];

export function SettingsAppearance() {
  const [theme, setTheme] = useState("system");
  const [primaryColor, setPrimaryColor] = useState("blue");
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY");
  const [currencyFormat, setCurrencyFormat] = useState("BRL");
  const [reduceAnimations, setReduceAnimations] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    localStorage.setItem("app_appearance", JSON.stringify({
      theme, primaryColor, dateFormat, currencyFormat, reduceAnimations,
    }));
    setSaving(false);
    toast.success("Aparência salva!");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Aparência</h2>
        <p className="text-sm text-muted-foreground">Personalize a aparência do sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    theme === t.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-xs font-medium">{t.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cor primária</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {PRIMARY_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setPrimaryColor(c.value)}
                className="h-10 w-10 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c.color,
                  borderColor: primaryColor === c.value ? "white" : "transparent",
                  boxShadow: primaryColor === c.value ? `0 0 0 2px ${c.color}` : "none",
                }}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Formatos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Idioma</Label>
              <Select defaultValue="pt-BR">
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">Português (BR)</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Formato de data</Label>
              <Select value={dateFormat} onValueChange={setDateFormat}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Moeda</Label>
              <Select value={currencyFormat} onValueChange={setCurrencyFormat}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">R$ (BRL)</SelectItem>
                  <SelectItem value="USD">$ (USD)</SelectItem>
                  <SelectItem value="EUR">€ (EUR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acessibilidade</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Reduzir animações</p>
              <p className="text-xs text-muted-foreground">Desativa transições e animações do sistema</p>
            </div>
            <Switch checked={reduceAnimations} onCheckedChange={setReduceAnimations} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar aparência
        </Button>
      </div>
    </div>
  );
}
