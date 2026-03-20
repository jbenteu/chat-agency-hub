import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import logo from "@/assets/logo.png";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  gestor: "Gestor",
  sucesso_cliente: "Sucesso do Cliente",
  cliente: "Cliente",
};

const InvitePage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [validating, setValidating] = useState(true);
  const [inviteData, setInviteData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Token não informado.");
      setValidating(false);
      return;
    }

    const validate = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("validate-invite", {
          body: { token },
        });

        if (fnError || !data?.valid) {
          setError(data?.error ?? "Link de convite inválido.");
        } else {
          setInviteData(data.invite);
        }
      } catch {
        setError("Erro ao validar o convite.");
      } finally {
        setValidating(false);
      }
    };
    validate();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }

    if (password.length < 8) {
      toast({ title: "Erro", description: "A senha deve ter no mínimo 8 caracteres.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("register-via-invite", {
        body: { token, first_name: firstName, last_name: lastName, email, password },
      });

      if (fnError || !data?.success) {
        toast({ title: "Erro", description: data?.error ?? "Erro ao criar conta.", variant: "destructive" });
        return;
      }

      toast({ title: "Sucesso!", description: "Conta criada com sucesso. Faça login para continuar." });
      navigate("/login", { replace: true });
    } catch {
      toast({ title: "Erro", description: "Erro inesperado ao criar conta.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (validating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <XCircle className="mb-4 h-12 w-12 text-destructive" />
            <h2 className="text-lg font-semibold mb-2">Convite Inválido</h2>
            <p className="text-sm text-muted-foreground mb-6">{error}</p>
            <Button variant="outline" onClick={() => navigate("/login")}>Ir para Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={logo} alt="Advanced Marketing" className="h-10 w-auto" />
          </div>
          <CardTitle className="text-xl">Criar sua conta</CardTitle>
          <CardDescription>
            Você foi convidado como <strong>{ROLE_LABELS[inviteData?.role_to_assign] ?? inviteData?.role_to_assign}</strong>
            {inviteData?.created_by_name && <> por {inviteData.created_by_name}</>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">Nome</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Sobrenome</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="Mínimo 8 caracteres" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirmar Senha</Label>
              <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando conta...</> : "Criar Conta"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default InvitePage;
