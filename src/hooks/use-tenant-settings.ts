import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useTenantSettings() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["tenant_settings"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: tenantId } = await supabase.rpc("get_user_tenant_id", { _user_id: user.id });
      if (!tenantId) throw new Error("No tenant");
      const { data, error } = await supabase
        .from("tenants")
        .select("id, settings")
        .eq("id", tenantId)
        .single();
      if (error) throw error;
      return { tenantId: data.id, settings: (data.settings || {}) as Record<string, unknown> };
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!query.data) throw new Error("No tenant data");
      const merged = { ...query.data.settings, ...patch };
      const { error } = await supabase
        .from("tenants")
        .update({ settings: merged })
        .eq("id", query.data.tenantId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant_settings"] }),
  });

  return {
    settings: query.data?.settings || {},
    tenantId: query.data?.tenantId,
    isLoading: query.isLoading,
    updateSettings,
  };
}
