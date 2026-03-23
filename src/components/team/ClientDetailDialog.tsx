import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Phone, Wifi, WifiOff, UserPlus, X, Loader2 } from "lucide-react";

interface ClientInstance {
  id: string;
  instance_name: string;
  display_name: string | null;
  status: string;
  phone_number: string | null;
}

interface ClientData {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  tenant_id?: string | null;
  whatsapp_instances: ClientInstance[];
}

interface AssignedUser {
  id: string;
  full_name: string;
  role: string;
}

interface Props {
  client: ClientData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

export function ClientDetailDialog({ client, open, onOpenChange, onUpdated }: Props) {
  const [gestors, setGestors] = useState<AssignedUser[]>([]);
  const [csUsers, setCsUsers] = useState<AssignedUser[]>([]);
  const [availableGestors, setAvailableGestors] = useState<AssignedUser[]>([]);
  const [availableCs, setAvailableCs] = useState<AssignedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAssignments = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      // Get all superiors of this client
      const { data: rels } = await supabase
        .from("user_relationships")
        .select("superior_id")
        .eq("subordinate_id", client.id);

      const superiorIds = (rels ?? []).map((r) => r.superior_id);

      if (superiorIds.length > 0) {
        const { data: superiorProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .in("id", superiorIds);

        const sups = (superiorProfiles ?? []) as AssignedUser[];
        setGestors(sups.filter((s) => s.role === "gestor"));
        setCsUsers(sups.filter((s) => s.role === "sucesso_cliente"));
      } else {
        setGestors([]);
        setCsUsers([]);
      }

      // Get all available gestors and CS
      const { data: allGestors } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("role", "gestor")
        .eq("is_active", true)
        .order("full_name");

      const { data: allCs } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("role", "sucesso_cliente")
        .eq("is_active", true)
        .order("full_name");

      setAvailableGestors((allGestors ?? []) as AssignedUser[]);
      setAvailableCs((allCs ?? []) as AssignedUser[]);
    } catch (e) {
      console.error("Erro ao buscar atribuições:", e);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (open && client) fetchAssignments();
  }, [open, client, fetchAssignments]);

  const handleAssign = async (superiorId: string, role: string) => {
    if (!client) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_relationships")
        .insert({ superior_id: superiorId, subordinate_id: client.id });

      if (error) {
        if (error.code === "23505") {
          toast.info("Este usuário já está atribuído.");
        } else {
          throw error;
        }
      } else {
        toast.success(`${role === "gestor" ? "Gestor" : "Sucesso do Cliente"} atribuído com sucesso`);
        fetchAssignments();
        onUpdated?.();
      }
    } catch (e: any) {
      toast.error("Erro ao atribuir: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (superiorId: string, role: string) => {
    if (!client) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_relationships")
        .delete()
        .eq("superior_id", superiorId)
        .eq("subordinate_id", client.id);

      if (error) throw error;
      toast.success(`${role === "gestor" ? "Gestor" : "Sucesso do Cliente"} removido`);
      fetchAssignments();
      onUpdated?.();
    } catch (e: any) {
      toast.error("Erro ao remover: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  if (!client) return null;

  const unassignedGestors = availableGestors.filter((g) => !gestors.some((a) => a.id === g.id));
  const unassignedCs = availableCs.filter((c) => !csUsers.some((a) => a.id === c.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="text-xs">{getInitials(client.full_name)}</AvatarFallback>
            </Avatar>
            <div>
              <p>{client.full_name}</p>
              <Badge variant={client.is_active ? "default" : "secondary"} className="text-[10px] mt-0.5">
                {client.is_active ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Contact Info */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {client.email && (
            <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{client.email}</span>
          )}
          {client.phone && (
            <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{client.phone}</span>
          )}
        </div>

        {/* WhatsApp Instances */}
        <div>
          <h4 className="text-sm font-medium mb-2">Instâncias WhatsApp</h4>
          {client.whatsapp_instances.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Sem instância WhatsApp</p>
          ) : (
            <div className="space-y-1.5">
              {client.whatsapp_instances.map((inst) => (
                <div key={inst.id} className="flex items-center gap-2 text-sm rounded-md border border-border p-2">
                  {inst.status === "connected" ? (
                    <Wifi className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate flex-1">{inst.display_name || inst.phone_number || inst.instance_name}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {inst.status === "connected" ? "Conectado" : "Desconectado"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Gestors */}
            <div>
              <h4 className="text-sm font-medium mb-2">Gestores Atribuídos</h4>
              <div className="space-y-1.5">
                {gestors.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum gestor atribuído</p>}
                {gestors.map((g) => (
                  <div key={g.id} className="flex items-center justify-between rounded-md border border-border p-2">
                    <span className="text-sm">{g.full_name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemove(g.id, "gestor")} disabled={saving}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              {unassignedGestors.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <Select onValueChange={(v) => handleAssign(v, "gestor")} disabled={saving}>
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue placeholder="Adicionar gestor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unassignedGestors.map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              )}
            </div>

            {/* Sucesso do Cliente */}
            <div>
              <h4 className="text-sm font-medium mb-2">Sucesso do Cliente</h4>
              <div className="space-y-1.5">
                {csUsers.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum CS atribuído</p>}
                {csUsers.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md border border-border p-2">
                    <span className="text-sm">{c.full_name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemove(c.id, "sucesso_cliente")} disabled={saving}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              {unassignedCs.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <Select onValueChange={(v) => handleAssign(v, "sucesso_cliente")} disabled={saving}>
                    <SelectTrigger className="flex-1 h-8 text-xs">
                      <SelectValue placeholder="Adicionar CS..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unassignedCs.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
