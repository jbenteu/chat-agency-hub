import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import logo from "@/assets/logo.png";

const SLOW_REQUEST_NOTICE_MS = 15000;

const LoginPage: React.FC = () => {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      navigate("/", { replace: true });
    }
  }, [loading, session, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (session) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const normalizedEmail = email.trim().toLowerCase();
    const slowRequestTimer = window.setTimeout(() => {
      toast({
        title: "Conexão lenta",
        description: "A autenticação está demorando mais que o normal. Ainda estamos tentando...",
      });
    }, SLOW_REQUEST_NOTICE_MS);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;

        if (data.session) {
          window.location.assign("/");
          return;
        }

        toast({
          title: "Conta criada!",
          description: "Verifique seu email para confirmar o cadastro antes do login.",
        });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) throw error;
        if (!data.session) throw new Error("Não foi possível iniciar sessão.");

        window.location.assign("/");
      }
    } catch (error: any) {
      toast({
        title: "Erro de autenticação",
        description: error?.message ?? "Falha ao autenticar. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      window.clearTimeout(slowRequestTimer);
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <img src={logo} alt="Advanced Marketing" className="h-16 w-auto" />
        </div>
        <Card className="border-border">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {isSignUp ? "Criar conta" : "Entrar"}
            </CardTitle>
            <CardDescription>
              {isSignUp ? "Cadastre-se para acessar o painel" : "Entre com seu email e senha"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Carregando..." : isSignUp ? "Criar conta" : "Entrar"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {isSignUp ? "Já tem conta?" : "Não tem conta?"}{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setIsSignUp(!isSignUp)}
              >
                {isSignUp ? "Entrar" : "Criar conta"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
