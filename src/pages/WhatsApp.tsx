import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

const WhatsApp = () => {
  const { toast } = useToast();
  const { loading, error, createInstance, getQrCode, getConnectionStatus, listInstances, deleteInstance } =
    useEvolutionApi();

  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  
  
  const [qrCodeData, setQrCodeData] = useState<{ base64?: string; instanceName?: string } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);
  const [loadingInstances, setLoadingInstances] = useState(true);

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

  const handleCreate = async () => {
    const name = `inst-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    try {
      const data = await createInstance(name);
      toast({ title: "Instância criada!", description: "Escaneie o QR Code para conectar." });

      if (data.qrcode?.base64) {
        setQrCodeData({ base64: data.qrcode.base64, instanceName: name });
      }

      
      await fetchInstances();
    } catch (err: any) {
      toast({ title: "Erro ao criar instância", description: err.message, variant: "destructive" });
    }
  };

  const handleGetQr = async (instanceName: string) => {
    try {
      const data = await getQrCode(instanceName);
      setQrCodeData({ base64: data.qrcode?.base64, instanceName });
      if (!data.qrcode?.base64) {
        toast({ title: "QR Code", description: "Nenhum QR Code disponível. A instância já pode estar conectada.", variant: "default" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao obter QR Code", description: err.message, variant: "destructive" });
    }
  };

  const handleCheckStatus = async (instanceName: string) => {
    setCheckingStatus(instanceName);
    try {
      const data = await getConnectionStatus(instanceName);
      toast({
        title: data.connected ? "Conectado!" : "Aguardando conexão",
        description: data.connected
          ? `"${instanceName}" está conectado ao WhatsApp.`
          : `"${instanceName}" ainda não está conectado. Escaneie o QR Code.`,
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
      toast({ title: "Instância removida", description: `"${instanceName}" foi removida.` });
      if (qrCodeData?.instanceName === instanceName) setQrCodeData(null);
      await fetchInstances();
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "connected") {
      return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"><Wifi className="mr-1 h-3 w-3" />Conectado</Badge>;
    }
    if (status === "connecting") {
      return <Badge variant="secondary" className="text-amber-600"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Conectando</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground"><WifiOff className="mr-1 h-3 w-3" />Desconectado</Badge>;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie suas instâncias e conversas do WhatsApp
            </p>
          </div>
          <Button onClick={() => handleCreate()} size="sm" disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
            Nova Instância
          </Button>
        </div>

        {/* QR Code Display */}
        {qrCodeData?.base64 && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Smartphone className="h-5 w-5 text-primary" />
                Escaneie o QR Code
              </CardTitle>
              <CardDescription>
                Abra o WhatsApp no celular → Menu (⋮) → Aparelhos conectados → Conectar aparelho
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <div className="rounded-xl border-2 border-border bg-white p-4">
                <img
                  src={`data:image/png;base64,${qrCodeData.base64}`}
                  alt="QR Code WhatsApp"
                  className="h-64 w-64"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleGetQr(qrCodeData.instanceName!)}
                  disabled={loading}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Atualizar QR
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleCheckStatus(qrCodeData.instanceName!)}
                  disabled={loading}
                >
                  <Wifi className="mr-1.5 h-3.5 w-3.5" />
                  Verificar Conexão
                </Button>
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
                Nenhuma instância conectada
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1 mb-4">
                Crie uma instância e escaneie o QR Code para começar
              </p>
              <Button onClick={() => setShowCreateForm(true)} variant="outline" size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Criar Instância
              </Button>
            </CardContent>
          </Card>
        ) : instances.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Instâncias ({instances.length})
            </h2>
            {instances.map((inst) => (
              <Card key={inst.id}>
                <CardContent className="flex items-center justify-between py-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <MessageCircle className="h-4.5 w-4.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{inst.instance_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {inst.phone_number || "Sem número associado"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(inst.status)}
                    {inst.status !== "connected" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGetQr(inst.instance_name)}
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
        ) : null}
      </div>
    </AppLayout>
  );
};

export default WhatsApp;
