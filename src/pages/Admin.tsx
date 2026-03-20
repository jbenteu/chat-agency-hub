import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Shield, Search, Users, Link2, Loader2, UserPlus, X, CheckCircle2, XCircle,
} from "lucide-react";

type UserRole = "admin" | "gerente" | "gestor" | "sucesso_cliente" | "cliente";

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: UserRole | null;
  is_active: boolean | null;
  created_at: string | null;
}

interface Relationship {
  id: string;
  superior_id: string;
  subordinate_id: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  gerente: "Gerente",
  gestor: "Gestor",
  sucesso_cliente: "Sucesso do Cliente",
  cliente: "Cliente",
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  gerente: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  gestor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  sucesso_cliente: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cliente: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const Admin = () => {
  const { profile, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Link dialog
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUser, setLinkUser] = useState<ProfileRow | null>(null);
  const [linkTarget, setLinkTarget] = useState<string>("");
  const [savingLink, setSavingLink] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [usersRes, relsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, avatar_url, role, is_active, created_at").order("created_at", { ascending: false }),
      supabase.from("user_relationships").select("id, superior_id, subordinate_id"),
    ]);
    if (usersRes.data) setUsers(usersRes.data as unknown as ProfileRow[]);
    if (relsRes.data) setRelationships(relsRes.data as Relationship[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = users.filter((u) => {
    const matchesSearch = !search || [u.full_name, u.email].some((f) => f?.toLowerCase().includes(search.toLowerCase()));
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  };

  const toggleActive = async (userId: string, currentActive: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_active: !currentActive }).eq("id", userId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_active: !currentActive } : u));
      toast({ title: !currentActive ? "Usuário ativado" : "Usuário desativado" });
    }
  };

  const changeRole = async (userId: string, newRole: UserRole) => {
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", userId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
      toast({ title: "Papel atualizado" });
    }
  };

  const getSuperior = (userId: string) => {
    const rel = relationships.find((r) => r.subordinate_id === userId);
    if (!rel) return null;
    return users.find((u) => u.id === rel.superior_id) ?? null;
  };

  const getSubordinates = (userId: string) => {
    const rels = relationships.filter((r) => r.superior_id === userId);
    return rels.map((r) => users.find((u) => u.id === r.subordinate_id)).filter(Boolean) as ProfileRow[];
  };

  const openLinkDialog = (user: ProfileRow) => {
    setLinkUser(user);
    setLinkTarget("");
    setLinkDialogOpen(true);
  };

  const possibleSuperiors = linkUser
    ? users.filter((u) => {
        if (u.id === linkUser.id) return false;
        const role = linkUser.role;
        if (role === "gestor" || role === "sucesso_cliente") return u.role === "gerente" || u.role === "admin";
        if (role === "cliente") return u.role === "gestor" || u.role === "sucesso_cliente" || u.role === "gerente" || u.role === "admin";
        if (role === "gerente") return u.role === "admin";
        return false;
      })
    : [];

  const saveLink = async () => {
    if (!linkUser || !linkTarget) return;
    setSavingLink(true);

    // Remove existing superior relationship
    const existingRel = relationships.find((r) => r.subordinate_id === linkUser.id);
    if (existingRel) {
      await supabase.from("user_relationships").delete().eq("id", existingRel.id);
    }

    const { data, error } = await supabase
      .from("user_relationships")
      .insert({ superior_id: linkTarget, subordinate_id: linkUser.id })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else if (data) {
      setRelationships((prev) => [
        ...prev.filter((r) => r.subordinate_id !== linkUser.id),
        data as Relationship,
      ]);
      toast({ title: "Vínculo atualizado" });
      setLinkDialogOpen(false);
    }
    setSavingLink(false);
  };

  const removeLink = async (relId: string) => {
    const { error } = await supabase.from("user_relationships").delete().eq("id", relId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setRelationships((prev) => prev.filter((r) => r.id !== relId));
      toast({ title: "Vínculo removido" });
    }
  };

  const roleCounts = users.reduce<Record<string, number>>((acc, u) => {
    const r = u.role ?? "cliente";
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {});

  if (profile?.role !== "admin" && !isSuperAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Shield className="h-12 w-12 mb-4 opacity-40" />
          <p className="text-sm font-medium">Acesso restrito a administradores</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel Administrativo</h1>
          <p className="text-sm text-muted-foreground">Gerencie usuários, papéis e vínculos hierárquicos</p>
        </div>

        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
            <Card key={role} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setRoleFilter(roleFilter === role ? "all" : role)}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <span className="text-xs font-medium text-muted-foreground">{ROLE_LABELS[role]}</span>
                <span className="text-lg font-bold">{roleCounts[role] ?? 0}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filtrar por papel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os papéis</SelectItem>
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Users list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Usuários ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">Nenhum usuário encontrado</div>
            ) : (
              <ScrollArea className="max-h-[600px]">
                <div className="divide-y divide-border">
                  {filtered.map((u) => {
                    const superior = getSuperior(u.id);
                    const subordinates = getSubordinates(u.id);
                    return (
                      <div key={u.id} className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors">
                        <Avatar className="h-10 w-10 mt-0.5">
                          <AvatarImage src={u.avatar_url ?? undefined} />
                          <AvatarFallback className="text-xs">{getInitials(u.full_name)}</AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{u.full_name || "Sem nome"}</span>
                            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[u.role ?? "cliente"]}`}>
                              {ROLE_LABELS[u.role ?? "cliente"]}
                            </Badge>
                            {u.is_active === false && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-destructive text-destructive">Inativo</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>

                          {/* Relationships */}
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            {superior && (
                              <span className="text-[11px] text-muted-foreground">
                                Superior: <span className="font-medium text-foreground">{superior.full_name}</span>
                              </span>
                            )}
                            {subordinates.length > 0 && (
                              <span className="text-[11px] text-muted-foreground">
                                Subordinados: <span className="font-medium text-foreground">{subordinates.length}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Select
                            value={u.role ?? "cliente"}
                            onValueChange={(v) => changeRole(u.id, v as UserRole)}
                          >
                            <SelectTrigger className="h-8 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                                <SelectItem key={r} value={r} className="text-xs">{ROLE_LABELS[r]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Gerenciar vínculo"
                            onClick={() => openLinkDialog(u)}
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${u.is_active === false ? "text-emerald-600" : "text-destructive"}`}
                            title={u.is_active === false ? "Ativar" : "Desativar"}
                            onClick={() => toggleActive(u.id, u.is_active !== false)}
                          >
                            {u.is_active === false ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Link dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar vínculo</DialogTitle>
          </DialogHeader>
          {linkUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={linkUser.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xs">{getInitials(linkUser.full_name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{linkUser.full_name || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[linkUser.role ?? "cliente"]}</p>
                </div>
              </div>

              {/* Current superior */}
              {(() => {
                const rel = relationships.find((r) => r.subordinate_id === linkUser.id);
                const sup = rel ? users.find((u) => u.id === rel.superior_id) : null;
                if (!rel || !sup) return null;
                return (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Superior atual</Label>
                    <div className="flex items-center justify-between p-2 rounded-md border">
                      <span className="text-sm">{sup.full_name}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLink(rel.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-1.5">
                <Label className="text-xs">Vincular a (superior)</Label>
                <Select value={linkTarget} onValueChange={setLinkTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o superior..." />
                  </SelectTrigger>
                  <SelectContent>
                    {possibleSuperiors.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || u.email} — {ROLE_LABELS[u.role ?? "cliente"]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Current subordinates */}
              {(() => {
                const subs = getSubordinates(linkUser.id);
                if (subs.length === 0) return null;
                return (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Subordinados ({subs.length})</Label>
                    <div className="space-y-1">
                      {subs.map((s) => {
                        const rel = relationships.find((r) => r.superior_id === linkUser.id && r.subordinate_id === s.id);
                        return (
                          <div key={s.id} className="flex items-center justify-between p-2 rounded-md border text-sm">
                            <span>{s.full_name || s.email}</span>
                            {rel && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLink(rel.id)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveLink} disabled={!linkTarget || savingLink}>
              {savingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Admin;