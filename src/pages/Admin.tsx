import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { Shield, Users, Building2, Smartphone, Wifi, WifiOff, Loader2, Save, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TenantData {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, any> | null;
  created_at: string;
  instance_count: number;
  connected_count: number;
  user_count: number;
  max_whatsapp_instances: number;
  instances: InstanceData[];
}

interface InstanceData {
  id: string;
  tenant_id: string;
  instance_name: string;
  display_name: string | null;
  status: string;
  phone_number: string | null;
  owner_id: string | null;
  created_at: string;
}

interface ProfileData {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  is_active: boolean | null;
  created_at: string;
}

interface Stats {
  total_tenants: number;
  total_users: number;
  active_users: number;
  total_instances: number;
  connected_instances: number;
}

const Admin = () => {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<TenantData[]>([]);
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [instances, setInstances] = useState<InstanceData[]>([]);
  const [editingLimits, setEditingLimits] = useState<Record<string, number>>({});
  const [savingTenant, setSavingTenant] = useState<string | null>(null);
  const [togglingUser, setTogglingUser] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      navigate("/", { replace: true });
    }
  }, [authLoading, isSuperAdmin, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await supabase.functions.invoke("admin-dashboard", {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw res.error;
      const d = res.data;
      setStats(d.stats);
      setTenants(d.tenants || []);
      setProfiles(d.profiles || []);
      setInstances(d.instances || []);

      // Init editing limits
      const limits: Record<string, number> = {};
      (d.tenants || []).forEach((t: TenantData) => { limits[t.id] = t.max_whatsapp_instances; });
      setEditingLimits(limits);
    } catch (err: any) {
      toast.error("Erro ao carregar dados: " + (err.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isSuperAdmin) fetchData();
  }, [authLoading, isSuperAdmin, fetchData]);

  const handleSaveLimit = async (tenantId: string) => {
    setSavingTenant(tenantId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await supabase.functions.invoke("admin-dashboard?action=update_tenant_settings", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { tenant_id: tenantId, settings: { max_whatsapp_instances: editingLimits[tenantId] } },
      });
      if (res.error) throw res.error;
      toast.success("Limite atualizado com sucesso");
      fetchData();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || ""));
    } finally {
      setSavingTenant(null);
    }
  };

  const handleToggleUser = async (userId: string, currentStatus: boolean | null) => {
    setTogglingUser(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await supabase.functions.invoke("admin-dashboard?action=toggle_user_status", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { user_id: userId, is_active: !(currentStatus ?? true) },
      });
      if (res.error) throw res.error;
      toast.success("Status atualizado");
      fetchData();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    } finally {
      setTogglingUser(null);
    }
  };

  if (authLoading || !isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const getRoleBadge = (role: string | null) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
      admin: { label: "Admin", variant: "destructive" },
      gerente: { label: "Gerente", variant: "default" },
      gestor: { label: "Gestor", variant: "secondary" },
      sucesso_cliente: { label: "CS", variant: "secondary" },
      cliente: { label: "Cliente", variant: "outline" },
    };
    const m = map[role || ""] || { label: role || "—", variant: "outline" as const };
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    if (status === "connected") return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200">Conectado</Badge>;
    if (status === "connecting") return <Badge variant="secondary">Conectando</Badge>;
    return <Badge variant="outline" className="text-muted-foreground">Desconectado</Badge>;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Painel Administrativo
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Gerenciamento de tenants, usuários e instâncias</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2.5"><Building2 className="h-5 w-5 text-primary" /></div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{stats?.total_tenants ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Tenants</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-500/10 p-2.5"><Users className="h-5 w-5 text-blue-600" /></div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{stats?.active_users ?? 0}<span className="text-sm font-normal text-muted-foreground">/{stats?.total_users ?? 0}</span></p>
                      <p className="text-xs text-muted-foreground">Usuários ativos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-emerald-500/10 p-2.5"><Wifi className="h-5 w-5 text-emerald-600" /></div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{stats?.connected_instances ?? 0}<span className="text-sm font-normal text-muted-foreground">/{stats?.total_instances ?? 0}</span></p>
                      <p className="text-xs text-muted-foreground">Instâncias conectadas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-amber-500/10 p-2.5"><Smartphone className="h-5 w-5 text-amber-600" /></div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{stats?.total_instances ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Total instâncias</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="tenants" className="space-y-4">
              <TabsList>
                <TabsTrigger value="tenants">Tenants & Limites</TabsTrigger>
                <TabsTrigger value="instances">Instâncias WhatsApp</TabsTrigger>
                <TabsTrigger value="users">Usuários</TabsTrigger>
              </TabsList>

              {/* TENANTS TAB */}
              <TabsContent value="tenants" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Gerenciamento de Tenants</CardTitle>
                    <CardDescription>Configure limites de instâncias WhatsApp por cliente</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {tenants.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Nenhum tenant encontrado</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tenant</TableHead>
                            <TableHead className="text-center">Usuários</TableHead>
                            <TableHead className="text-center">Instâncias</TableHead>
                            <TableHead className="text-center">Conectadas</TableHead>
                            <TableHead>Limite WhatsApp</TableHead>
                            <TableHead className="w-[80px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tenants.map((t) => {
                            const limitChanged = editingLimits[t.id] !== t.max_whatsapp_instances;
                            return (
                              <TableRow key={t.id}>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-sm">{t.name}</p>
                                    <p className="text-xs text-muted-foreground">{t.slug}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center tabular-nums">{t.user_count}</TableCell>
                                <TableCell className="text-center tabular-nums">{t.instance_count}</TableCell>
                                <TableCell className="text-center">
                                  <span className={`tabular-nums font-medium ${t.connected_count > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                                    {t.connected_count}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-3 min-w-[180px]">
                                    <Slider
                                      value={[editingLimits[t.id] ?? 3]}
                                      onValueChange={([v]) => setEditingLimits(prev => ({ ...prev, [t.id]: v }))}
                                      min={1}
                                      max={10}
                                      step={1}
                                      className="flex-1"
                                    />
                                    <span className="text-sm font-medium tabular-nums w-6 text-center">{editingLimits[t.id] ?? 3}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {limitChanged && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleSaveLimit(t.id)}
                                      disabled={savingTenant === t.id}
                                    >
                                      {savingTenant === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* INSTANCES TAB */}
              <TabsContent value="instances" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Instâncias WhatsApp</CardTitle>
                    <CardDescription>Visão geral de todas as instâncias do sistema</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {instances.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Nenhuma instância encontrada</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Instância</TableHead>
                            <TableHead>Tenant</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Criada em</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {instances.map((inst) => {
                            const tenant = tenants.find(t => t.id === inst.tenant_id);
                            return (
                              <TableRow key={inst.id}>
                                <TableCell>
                                  <p className="font-medium text-sm">{inst.display_name || inst.instance_name}</p>
                                  {inst.display_name && <p className="text-xs text-muted-foreground">{inst.instance_name}</p>}
                                </TableCell>
                                <TableCell className="text-sm">{tenant?.name || "—"}</TableCell>
                                <TableCell className="text-sm tabular-nums">{inst.phone_number || "—"}</TableCell>
                                <TableCell>{getStatusBadge(inst.status)}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {inst.created_at ? new Date(inst.created_at).toLocaleDateString("pt-BR") : "—"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* USERS TAB */}
              <TabsContent value="users" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Usuários do Sistema</CardTitle>
                    <CardDescription>Gerencie o status de todos os usuários</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {profiles.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Nenhum usuário encontrado</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Usuário</TableHead>
                            <TableHead>Papel</TableHead>
                            <TableHead>Criado em</TableHead>
                            <TableHead className="text-center">Ativo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {profiles.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-sm">{p.full_name || "Sem nome"}</p>
                                  <p className="text-xs text-muted-foreground">{p.email || "—"}</p>
                                </div>
                              </TableCell>
                              <TableCell>{getRoleBadge(p.role)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {p.created_at ? new Date(p.created_at).toLocaleDateString("pt-BR") : "—"}
                              </TableCell>
                              <TableCell className="text-center">
                                <Switch
                                  checked={p.is_active ?? true}
                                  onCheckedChange={() => handleToggleUser(p.id, p.is_active)}
                                  disabled={togglingUser === p.id}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default Admin;
