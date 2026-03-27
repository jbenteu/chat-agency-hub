import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getTenantId } from "@/hooks/use-contacts";

export interface LeadSource {
  id: string;
  tenant_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  is_default: boolean;
  order: number;
  created_at: string | null;
}

export function useLeadSources() {
  const qc = useQueryClient();
  const qk = ["lead_sources"];

  const query = useQuery({
    queryKey: qk,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("lead_sources")
        .select("*")
        .order("order", { ascending: true });
      if (error) throw error;
      return (data || []) as LeadSource[];
    },
  });

  const create = useMutation({
    mutationFn: async (r: { name: string; icon?: string; color?: string }) => {
      const tenantId = await getTenantId();
      const order = (query.data?.length || 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("lead_sources")
        .insert({ ...r, tenant_id: tenantId, order });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LeadSource> & { id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("lead_sources")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("lead_sources")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  return { sources: query.data || [], isLoading: query.isLoading, create, update, remove };
}
