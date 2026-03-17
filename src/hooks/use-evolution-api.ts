import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface EvolutionInstance {
  id: string;
  tenant_id: string;
  instance_name: string;
  display_name: string | null;
  instance_id: string | null;
  status: string;
  phone_number: string | null;
  qr_code: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface QrCodeData {
  base64?: string;
  code?: string;
}

export function useEvolutionApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callEvolution = useCallback(async (body: Record<string, unknown>) => {
    setLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Não autenticado");

      const { data, error: fnError } = await supabase.functions.invoke("evolution-api", {
        body,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      return data;
    } catch (err: any) {
      const msg = err.message || "Erro desconhecido";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createInstance = useCallback(
    (instanceName: string, displayName?: string) =>
      callEvolution({ action: "create_instance", instanceName, displayName }),
    [callEvolution]
  );

  const updateDisplayName = useCallback(
    (instanceName: string, displayName: string) =>
      callEvolution({ action: "update_display_name", instanceName, displayName }),
    [callEvolution]
  );

  const getQrCode = useCallback(
    (instanceName: string) => callEvolution({ action: "get_qrcode", instanceName }),
    [callEvolution]
  );

  const getConnectionStatus = useCallback(
    (instanceName: string) => callEvolution({ action: "connection_status", instanceName }),
    [callEvolution]
  );

  const listInstances = useCallback(
    () => callEvolution({ action: "list_instances" }),
    [callEvolution]
  );

  const deleteInstance = useCallback(
    (instanceName: string) => callEvolution({ action: "delete_instance", instanceName }),
    [callEvolution]
  );

  return {
    loading,
    error,
    createInstance,
    getQrCode,
    getConnectionStatus,
    listInstances,
    deleteInstance,
  };
}

export type { EvolutionInstance, QrCodeData };
