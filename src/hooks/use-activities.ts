import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Activity {
  id: string;
  type: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  contact_id: string | null;
  deal_id: string | null;
  tenant_id: string;
  created_by: string | null;
  created_at: string | null;
}

export function useActivities(opts?: { contact_id?: string; deal_id?: string; limit?: number }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["activities", opts],
    queryFn: async () => {
      let q = supabase
        .from("activities")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(opts?.limit || 50);

      if (opts?.contact_id) q = q.eq("contact_id", opts.contact_id);
      if (opts?.deal_id) q = q.eq("deal_id", opts.deal_id);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Activity[];
    },
    enabled: !!(opts?.contact_id || opts?.deal_id),
  });

  const createActivity = useMutation({
    mutationFn: async (activity: {
      type: string;
      content: string;
      contact_id?: string;
      deal_id?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: tenantId } = await supabase.rpc("get_user_tenant_id", { _user_id: user.id });
      const { error } = await supabase.from("activities").insert({
        ...activity,
        tenant_id: tenantId as string,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["activities"] }),
  });

  return { activities: query.data || [], isLoading: query.isLoading, createActivity };
}
