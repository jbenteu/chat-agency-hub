import { useState, useEffect } from "react";
import { useAuth, type UserRole } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Copy, Loader2, CheckCircle2 } from "lucide-react";

import { CREATION_PERMISSIONS } from "@/lib/role-permissions";

interface StaffOption {
  id: string;
  full_name: string;
  role: string;
}

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

  // Gestor/CS pre-assignment (only shown when roleToAssign === "cliente")
  const [gestorId, setGestorId] = useState<string>("");
  const [csId, setCsId] = useState<string>("");
  const [gestores, setGestores] = useState<StaffOption[]>([]);
  const [csUsers, setCsUsers] = useState<StaffOption[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  const userRole = profile?.role ?? "cliente";
  const allowedRoles = CREATION_PERMISSIONS[userRole] ?? [];

  if (allowedRoles.length === 0) return null;

  // Load gestores and CS when the role changes to "cliente"
  useEffect(() => {
    if (roleToAssign !== "cliente") {
      setGestores([]);
      setCsUsers([]);
      setGestorId("");
      setCsId("");
      return;
    }

    setLoadingStaff(true);
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ["gestor", "sucesso_cliente"])
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => {
        const all = data ?? [];
        setGestores(all.filter((p) => p.role === "gestor"));
        setCsUsers(all.filter((p) => p.role === "sucesso_cliente"));
      })
      .finally(() => setLoadingStaff(false));
  }, [roleToAssign]);

  const handleGenerate = async () => {
    if (!roleToAssign) {
      toast({ title: "Selecione o nível da conta", variant: "destructive" });
      return;
    }

    setLoading(true);
    setInviteUrl(null);
    setCopied(false);

    try {
      const body: Record<string, unknown> = { role_to_assign: roleToAssign };
      if (roleToAssign === "cliente") {
        if (gestorId) body.gestor_id = gestorId;
        if (csId) body.cs_id = csId;
      }

      const { data, error } = await supabase.functions.invoke("generate-invite-link", { body });

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
      setGestorId("");
      setCsId("");
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

          {/* Gestor and CS assignment — only for cliente invites */}
          {roleToAssign === "cliente" && (
            <>
              <div className="space-y-1.5">
                <Label>
                  Gestor responsável
                  <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
                </Label>
                <Select
                  value={gestorId}
                  onValueChange={setGestorId}
                  disabled={loadingStaff}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingStaff ? "Carregando..." : "Selecione um Gestor"} />
                  </SelectTrigger>
                  <SelectContent>
                    {gestores.length === 0 && !loadingStaff && (
                      <SelectItem value="_none" disabled>Nenhum gestor disponível</SelectItem>
                    )}
                    {gestores.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>
                  Sucesso do Cliente (CS)
                  <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
                </Label>
                <Select
                  value={csId}
                  onValueChange={setCsId}
                  disabled={loadingStaff}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingStaff ? "Carregando..." : "Selecione um CS"} />
                  </SelectTrigger>
                  <SelectContent>
                    {csUsers.length === 0 && !loadingStaff && (
                      <SelectItem value="_none" disabled>Nenhum CS disponível</SelectItem>
                    )}
                    {csUsers.map((cs) => (
                      <SelectItem key={cs.id} value={cs.id}>{cs.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

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
