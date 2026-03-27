import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Eye, EyeOff, Shield, Smartphone } from "lucide-react";
import { toast } from "sonner";

function getPasswordStrength(pw: string): { label: string; percent: number; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;

  if (score <= 1) return { label: "Fraca", percent: 20, color: "bg-destructive" };
  if (score <= 2) return { label: "Razoável", percent: 40, color: "bg-orange-500" };
  if (score <= 3) return { label: "Média", percent: 60, color: "bg-yellow-500" };
  if (score <= 4) return { label: "Forte", percent: 80, color: "bg-green-500" };
  return { label: "Muito forte", percent: 100, color: "bg-green-600" };
}

export function SettingsSecurity() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const strength = getPasswordStrength(newPassword);
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasMinLength = newPassword.length >= 8;
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const handleChangePassword = async () => {
    if (!passwordsMatch) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (!hasMinLength || !hasUpper || !hasNumber) {
      toast.error("A senha não atende aos requisitos mínimos.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Senha alterada com sucesso!");
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Segurança</h2>
        <p className="text-sm text-muted-foreground">Gerencie sua senha e sessões ativas</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Alterar Senha
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Senha atual</Label>
            <div className="relative">
              <Input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nova senha</Label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Confirmar nova senha</Label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {newPassword.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Progress value={strength.percent} className="h-2 flex-1" />
                <span className="text-xs font-medium text-muted-foreground">{strength.label}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={hasMinLength ? "default" : "secondary"} className="text-[10px]">
                  8+ caracteres
                </Badge>
                <Badge variant={hasUpper ? "default" : "secondary"} className="text-[10px]">
                  1 maiúscula
                </Badge>
                <Badge variant={hasNumber ? "default" : "secondary"} className="text-[10px]">
                  1 número
                </Badge>
                {confirmPassword.length > 0 && (
                  <Badge variant={passwordsMatch ? "default" : "destructive"} className="text-[10px]">
                    {passwordsMatch ? "Senhas coincidem" : "Senhas diferentes"}
                  </Badge>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleChangePassword}
              disabled={saving || !hasMinLength || !hasUpper || !hasNumber || !passwordsMatch}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Alterar senha
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4" /> Autenticação de 2 Fatores
          </CardTitle>
          <CardDescription>Adicione uma camada extra de segurança à sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg border border-dashed border-border bg-muted/20">
            <div>
              <p className="text-sm font-medium">2FA via aplicativo autenticador</p>
              <p className="text-xs text-muted-foreground">Em breve disponível</p>
            </div>
            <Badge variant="secondary">Em breve</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
