import { useState } from "react";
import { useAuth, type UserRole } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Copy, Loader2, CheckCircle2 } from "lucide-react";

const CREATION_PERMISSIONS: Record<string, { value: UserRole; label: string }[]> = {
  admin: [
    { value: "gerente", label: "Gerente" },
    { value: "gestor", label: "Gestor" },
    { value: "sucesso_cliente", label: "Sucesso do Cliente" },
    { value: "cliente", label: "Cliente" },
  ],
  gerente: [
    { value: "gestor", label: "Gestor" },
    { value: "sucesso_cliente", label: "Sucesso do Cliente" },
    { value: "cliente", label: "Cliente" },
  ],
  gestor: [{ value: "cliente", label: "Cliente" }],
  sucesso_cliente: [{ value: "cliente", label: "Cliente" }],
};

interface InviteDialogProps {
  defaultRole?: UserRole;
  trigger?: React.ReactNode;
}

export function InviteDialog({ defaultRole, trigger }: InviteDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [roleToAssign, setRoleToAssign] = useState<string>(defaultRole ?? "");
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const userRole = profile?.role ?? "cliente";
  const allowedRoles = CREATION_PERMISSIONS[userRole] ?? [];

  if (allowedRoles.length === 0) return null;

  const handleGenerate = async () => {
    if (!roleToAssign) {
      toast({ title: "Selecione o nível da conta", variant: "destructive" });
      return;
    }

    setLoading(true);
    setInviteUrl(null);
    setCopied(false);

    try {
      const { data, error } = await supabase.functions.invoke("generate-invite-link", {
        body: { role_to_assign: roleToAssign },
      });

      if (error || !data?.success) {
        toast({ title: "Erro", description: data?.error ?? "Erro ao gerar convite.", variant: "destructive" });
        return;
      }

      setInviteUrl(data.invite.url);
    } catch {
      toast({ title: "Erro", description: "Erro inesperado.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast({ title: "Link copiado!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenChange = (open: boolean) => {
    setOpen(open);
    if (!open) {
      setInviteUrl(null);
      setCopied(false);
      if (!defaultRole) setRoleToAssign("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <UserPlus className="mr-2 h-4 w-4" /> Criar nova Conta
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar Link de Convite</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nível da conta</Label>
            <Select value={roleToAssign} onValueChange={setRoleToAssign} disabled={!!defaultRole}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o nível" />
              </SelectTrigger>
              <SelectContent>
                {allowedRoles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!inviteUrl ? (
            <Button onClick={handleGenerate} disabled={loading || !roleToAssign} className="w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...</> : "Gerar Link de Convite"}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input value={inviteUrl} readOnly className="text-xs" />
                <Button size="icon" variant="outline" onClick={handleCopy}>
                  {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Este link é de uso único e expira em 7 dias.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
