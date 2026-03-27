import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getTenantId } from "@/hooks/use-contacts";

export interface LossReason {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  order: number;
  created_at: string | null;
}

export function useLossReasons() {
  const qc = useQueryClient();
  const qk = ["loss_reasons"];

  const query = useQuery({
    queryKey: qk,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("loss_reasons")
        .select("*")
        .order("order", { ascending: true });
      if (error) throw error;
      return (data || []) as LossReason[];
    },
  });

  const create = useMutation({
    mutationFn: async (r: { name: string; description?: string }) => {
      const tenantId = await getTenantId();
      const order = (query.data?.length || 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("loss_reasons")
        .insert({ ...r, tenant_id: tenantId, order });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LossReason> & { id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("loss_reasons")
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
        .from("loss_reasons")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  return { reasons: query.data || [], isLoading: query.isLoading, create, update, remove };
}
