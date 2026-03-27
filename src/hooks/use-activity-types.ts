import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getTenantId } from "@/hooks/use-contacts";

export interface ActivityType {
  id: string;
  tenant_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string | null;
}

export function useActivityTypes() {
  const qc = useQueryClient();
  const qk = ["activity_types"];

  const query = useQuery({
    queryKey: qk,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("activity_types")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as ActivityType[];
    },
  });

  const create = useMutation({
    mutationFn: async (r: { name: string; icon?: string; color?: string }) => {
      const tenantId = await getTenantId();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("activity_types")
        .insert({ ...r, tenant_id: tenantId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ActivityType> & { id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("activity_types")
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
        .from("activity_types")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  return { types: query.data || [], isLoading: query.isLoading, create, update, remove };
}
