import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface Deal {
  id: string;
  title: string;
  value: number | null;
  stage: string;
  status: string;
  contact_id: string | null;
  assigned_to: string | null;
  tenant_id: string;
  pipeline_stage_id: string | null;
  closed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  // joined
  contact?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    company: string | null;
    tags: string[] | null;
    city: string | null;
    state: string | null;
    origin: string | null;
  } | null;
  assignee?: { full_name: string | null; avatar_url: string | null } | null;
}

export function useDeals(filters?: {
  stage?: string;
  status?: string;
  assigned_to?: string;
  search?: string;
}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["deals", filters],
    queryFn: async () => {
      let q = supabase
        .from("deals")
        .select("*, contact:contacts(id, name, phone, email, company, tags, city, state, origin)")
        .order("created_at", { ascending: false });

      if (filters?.stage) q = q.eq("stage", filters.stage);
      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.assigned_to) q = q.eq("assigned_to", filters.assigned_to);
      if (filters?.search) {
        q = q.or(`title.ilike.%${filters.search}%,contact.name.ilike.%${filters.search}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Deal[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("deals-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () => {
        queryClient.invalidateQueries({ queryKey: ["deals"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const createDeal = useMutation({
    mutationFn: async (deal: {
      title: string;
      value?: number;
      stage?: string;
      contact_id?: string;
      assigned_to?: string;
      pipeline_stage_id?: string;
      tenant_id: string;
    }) => {
      const { data, error } = await supabase.from("deals").insert(deal).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
  });

  const updateDeal = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Deal> & { id: string }) => {
      const { error } = await supabase.from("deals").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
  });

  const moveDeal = useMutation({
    mutationFn: async ({
      id,
      stage,
      pipeline_stage_id,
      previousStage,
    }: {
      id: string;
      stage: string;
      pipeline_stage_id?: string;
      previousStage?: string;
    }) => {
      const updates: Record<string, unknown> = { stage, pipeline_stage_id };

      // Auto-update status based on stage name
      const lowerStage = stage.toLowerCase();
      if (lowerStage.includes("ganho") || lowerStage.includes("won")) {
        updates.status = "won";
        updates.closed_at = new Date().toISOString();
      } else if (lowerStage.includes("perdido") || lowerStage.includes("lost")) {
        updates.status = "lost";
        updates.closed_at = new Date().toISOString();
      } else {
        updates.status = "open";
        updates.closed_at = null;
      }

      const { error } = await supabase.from("deals").update(updates).eq("id", id);
      if (error) throw error;

      // Log activity
      if (previousStage && previousStage !== stage) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: tenantId } = await supabase.rpc("get_user_tenant_id", { _user_id: user!.id });
        // get deal's contact_id
        const { data: deal } = await supabase.from("deals").select("contact_id").eq("id", id).single();
        await supabase.from("activities").insert({
          tenant_id: tenantId as string,
          deal_id: id,
          contact_id: deal?.contact_id,
          type: "deal_update",
          content: `Deal movido de "${previousStage}" para "${stage}"`,
          created_by: user!.id,
          metadata: { from_stage: previousStage, to_stage: stage },
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
  });

  const deleteDeal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
  });

  return {
    deals: query.data || [],
    isLoading: query.isLoading,
    createDeal,
    updateDeal,
    moveDeal,
    deleteDeal,
  };
}
