import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useEvolutionApi, type EvolutionInstance } from "@/hooks/use-evolution-api";
import {
  MessageCircle,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  Loader2,
  Smartphone,
  Pencil,
  Users,
} from "lucide-react";

const WhatsApp = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const {
    loading,
    createInstance,
    getQrCode,
    getConnectionStatus,
    listInstances,
    deleteInstance,
    updateDisplayName,
    importContacts,
  } = useEvolutionApi();

  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [qrCodeData, setQrCodeData] = useState<{
    base64?: string;
    instanceName?: string;
    displayName?: string;
  } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);
  const [loadingInstances, setLoadingInstances] = useState(true);

  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newImportContacts, setNewImportContacts] = useState(true);
  const [newIgnoreGroups, setNewIgnoreGroups] = useState(false);

  // Rename dialog
  const [renameInstance, setRenameInstance] = useState<EvolutionInstance | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Import contacts state
  const [importingContacts, setImportingContacts] = useState<string | null>(null);

  // Auto-poll ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchInstances = useCallback(async () => {
    try {
      const data = await listInstances();
      setInstances(data.instances || []);
    } catch {
      // error handled by hook
    } finally {
      setLoadingInstances(false);
    }
  }, [listInstances]);

  useEffect(() => {
    fetchInstances();
  }, []);

  // Auto-poll connection status while QR is displayed
  useEffect(() => {
    if (!qrCodeData?.instanceName) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const instanceName = qrCodeData.instanceName;

    pollRef.current = setInterval(async () => {
      try {
        const data = await getConnectionStatus(instanceName);
        if (data.connected) {
          if (pollRef.current) clearInterval(pollRef.current);
          setQrCodeData(null);
          toast({
            title: "WhatsApp conectado!",
            description: "Redirecionando para o gerenciador de conversas…",
          });
          await fetchInstances();
          navigate("/whatsapp");
        }
      } catch {
        // silently retry on next interval
      }
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [qrCodeData?.instanceName]);

  const getDisplayLabel = (inst: EvolutionInstance) =>
    inst.display_name || inst.phone_number || "Conexão WhatsApp";

  const handleCreate = async () => {
    const internalName = `inst-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const label = newDisplayName.trim() || undefined;

    try {
      const data = await createInstance(internalName, label, { importContacts: newImportContacts, ignoreGroups: newIgnoreGroups });
      toast({ title: "Conexão criada!", description: "Escaneie o QR Code para conectar." });

      if (data.qrcode?.base64) {
        setQrCodeData({
          base64: data.qrcode.base64,
          instanceName: internalName,
          displayName: label,
        });
      }

      setShowCreateDialog(false);
      setNewDisplayName("");
      await fetchInstances();
    } catch (err: any) {
      toast({ title: "Erro ao criar conexão", description: err.message, variant: "destructive" });
    }
  };

  const handleGetQr = async (instanceName: string, displayName?: string) => {
    try {
      const data = await getQrCode(instanceName);
      const qr = data.qrcode?.base64 || data.qrcode?.code;
      setQrCodeData({ base64: qr, instanceName, displayName });
      if (!qr) {
        toast({
          title: "QR Code",
          description: "Nenhum QR Code disponível. O WhatsApp já pode estar conectado.",
        });
      }
    } catch (err: any) {
      toast({ title: "Erro ao obter QR Code", description: err.message, variant: "destructive" });
    }
  };

  const handleCheckStatus = async (instanceName: string) => {
    setCheckingStatus(instanceName);
    try {
      const data = await getConnectionStatus(instanceName);
      const label =
        instances.find((i) => i.instance_name === instanceName)?.display_name || "Conexão";
      toast({
        title: data.connected ? "Conectado!" : "Aguardando conexão",
        description: data.connected
          ? `"${label}" está conectado ao WhatsApp.`
          : `"${label}" ainda não está conectado. Escaneie o QR Code.`,
      });
      if (data.connected) {
        setQrCodeData(null);
      }
      await fetchInstances();
    } catch (err: any) {
      toast({ title: "Erro ao verificar status", description: err.message, variant: "destructive" });
    } finally {
      setCheckingStatus(null);
    }
  };

  const handleDelete = async (instanceName: string) => {
    try {
      await deleteInstance(instanceName);
      const label =
        instances.find((i) => i.instance_name === instanceName)?.display_name || "Conexão";
      toast({ title: "Conexão removida", description: `"${label}" foi removida.` });
      if (qrCodeData?.instanceName === instanceName) setQrCodeData(null);
      await fetchInstances();
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    }
  };

  const handleImportContacts = async (instanceName: string) => {
    setImportingContacts(instanceName);
    try {
      await importContacts(instanceName);
      toast({
        title: "Importação iniciada",
        description: "Acompanhe o progresso no indicador no canto da tela.",
      });
    } catch (err: any) {
      toast({ title: "Erro ao importar", description: err.message, variant: "destructive" });
    } finally {
      setImportingContacts(null);
    }
  };

  const handleRename = async () => {
    if (!renameInstance || !renameValue.trim()) return;
    try {
      await updateDisplayName(renameInstance.instance_name, renameValue.trim());
      toast({ title: "Nome atualizado" });
      setRenameInstance(null);
      setRenameValue("");
      await fetchInstances();
    } catch (err: any) {
      toast({ title: "Erro ao renomear", description: err.message, variant: "destructive" });
    }
  };

  const normalizeQrBase64 = (raw?: string) => {
    if (!raw) return null;
    if (raw.startsWith("data:image")) return raw;
    return `data:image/png;base64,${raw}`;
  };

  const getStatusBadge = (status: string) => {
    if (status === "connected") {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
          <Wifi className="mr-1 h-3 w-3" />
          Conectado
        </Badge>
      );
    }
    if (status === "connecting") {
      return (
        <Badge variant="secondary" className="text-amber-600">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Conectando
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <WifiOff className="mr-1 h-3 w-3" />
        Desconectado
      </Badge>
    );
  };

  const qrSrc = normalizeQrBase64(qrCodeData?.base64);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie suas conexões e conversas do WhatsApp
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} size="sm" disabled={loading}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nova Conexão
          </Button>
        </div>

        {/* QR Code Display */}
        {qrSrc && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Smartphone className="h-5 w-5 text-primary" />
                Escaneie o QR Code
                {qrCodeData?.displayName && (
                  <span className="text-sm font-normal text-muted-foreground">
                    — {qrCodeData.displayName}
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Abra o WhatsApp no celular → Menu (⋮) → Aparelhos conectados → Conectar aparelho
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <div className="rounded-xl border-2 border-border bg-white p-4">
                <img src={qrSrc} alt="QR Code WhatsApp" className="h-64 w-64 object-contain" />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleGetQr(qrCodeData!.instanceName!, qrCodeData?.displayName)
                  }
                  disabled={loading}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Atualizar QR
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Aguardando leitura do QR Code…
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instances List */}
        {loadingInstances ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : instances.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <MessageCircle className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">
                Nenhuma conexão WhatsApp
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1 mb-4">
                Crie uma conexão e escaneie o QR Code para começar
              </p>
              <Button
                onClick={() => setShowCreateDialog(true)}
                variant="outline"
                size="sm"
                disabled={loading}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Nova Conexão
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Conexões ({instances.length})
            </h2>
            {instances.map((inst) => (
              <Card key={inst.id}>
                <CardContent className="flex items-center justify-between py-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <MessageCircle className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{getDisplayLabel(inst)}</p>
                      <p className="text-xs text-muted-foreground">
                        {inst.phone_number ||
                          (inst.status === "connected" ? "Número sincronizando..." : "Aguardando conexão")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(inst.status)}
                    {inst.status === "connected" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleImportContacts(inst.instance_name)}
                        disabled={importingContacts === inst.instance_name}
                        title="Importar contatos da agenda"
                      >
                        {importingContacts === inst.instance_name ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Users className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRenameInstance(inst);
                        setRenameValue(inst.display_name || "");
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {inst.status !== "connected" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGetQr(inst.instance_name, inst.display_name || undefined)}
                        disabled={loading}
                      >
                        <QrCode className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCheckStatus(inst.instance_name)}
                      disabled={checkingStatus === inst.instance_name}
                    >
                      {checkingStatus === inst.instance_name ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(inst.instance_name)}
                      disabled={loading}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Instance Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Conexão WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome da conexão (opcional)</label>
              <Input
                placeholder="Ex: Atendimento, Vendas, Suporte…"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <p className="text-xs text-muted-foreground">
                Um nome amigável para identificar esta conexão.
              </p>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">Configurações</p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="create-import-contacts"
                  checked={newImportContacts}
                  onCheckedChange={(v) => setNewImportContacts(Boolean(v))}
                />
                <label htmlFor="create-import-contacts" className="text-sm cursor-pointer">
                  Importar contatos da agenda
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="create-ignore-groups"
                  checked={newIgnoreGroups}
                  onCheckedChange={(v) => setNewIgnoreGroups(Boolean(v))}
                />
                <label htmlFor="create-ignore-groups" className="text-sm cursor-pointer">
                  Ignorar mensagens de grupos
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={loading}>
              {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameInstance} onOpenChange={(open) => !open && setRenameInstance(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear Conexão</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Novo nome…"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameInstance(null)}>
              Cancelar
            </Button>
            <Button onClick={handleRename} disabled={loading || !renameValue.trim()}>
              {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default WhatsApp;