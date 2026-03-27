import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";

export interface DealItem {
  id: string;
  deal_id: string;
  tenant_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
  created_at: string | null;
}

export interface Deal {
  id: string;
  title: string;
  value: number | null;
  stage: string;
  status: string;
  priority: string | null;
  expected_close_date: string | null;
  loss_reason: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  tenant_id: string;
  pipeline_stage_id: string | null;
  closed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
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
  deal_items?: DealItem[];
}

export function useDeals() {
  const queryClient = useQueryClient();
  const mutatingRef = useRef(false);

  const query = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("deals")
        .select(`
          *,
          contact:contacts(id, name, phone, email, company, tags, city, state, origin),
          deal_items(id, deal_id, tenant_id, product_name, quantity, unit_price, notes, created_at)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Deal[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("deals-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () => {
        if (!mutatingRef.current) {
          queryClient.invalidateQueries({ queryKey: ["deals"] });
        }
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
      priority?: string;
      expected_close_date?: string | null;
    }) => {
      const { data, error } = await supabase.from("deals").insert(deal as never).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
  });

  const updateDeal = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Deal> & { id: string }) => {
      // Clean up joined fields before updating
      const { contact, assignee, deal_items, ...cleanUpdates } = updates as Record<string, unknown>;
      const { error } = await supabase.from("deals").update(cleanUpdates as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
  });

  const moveDeal = useMutation({
    mutationFn: async ({
      id, stage, pipeline_stage_id, previousStage,
    }: {
      id: string; stage: string; pipeline_stage_id?: string; previousStage?: string;
    }) => {
      const updates: Record<string, unknown> = { stage, pipeline_stage_id };
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

      const { error } = await supabase.from("deals").update(updates as never).eq("id", id);
      if (error) throw error;

      if (previousStage && previousStage !== stage) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: tenantId } = await supabase.rpc("get_user_tenant_id", { _user_id: user!.id });
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
    onMutate: async ({ id, stage, pipeline_stage_id }) => {
      mutatingRef.current = true;
      await queryClient.cancelQueries({ queryKey: ["deals"] });
      const previous = queryClient.getQueryData<Deal[]>(["deals"]);
      const lowerStage = stage.toLowerCase();
      const newStatus = lowerStage.includes("ganho") || lowerStage.includes("won")
        ? "won"
        : lowerStage.includes("perdido") || lowerStage.includes("lost")
        ? "lost"
        : "open";
      queryClient.setQueryData<Deal[]>(["deals"], (old) =>
        (old || []).map((d) =>
          d.id === id
            ? { ...d, stage, status: newStatus, pipeline_stage_id: pipeline_stage_id ?? d.pipeline_stage_id }
            : d
        )
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["deals"], context.previous);
      }
    },
    onSettled: () => {
      setTimeout(() => {
        mutatingRef.current = false;
        queryClient.invalidateQueries({ queryKey: ["deals"] });
      }, 500);
    },
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
