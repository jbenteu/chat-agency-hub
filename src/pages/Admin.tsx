import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";

const Admin = () => {
  const { isSuperAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isSuperAdmin) {
      navigate("/", { replace: true });
    }
  }, [loading, isSuperAdmin, navigate]);

  if (loading || !isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">Painel administrativo do sistema</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Shield className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">Área administrativa em breve</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Gerenciamento de tenants e usuários</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Admin;
