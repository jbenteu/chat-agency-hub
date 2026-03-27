import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface Task {
  id: string;
  tenant_id: string;
  contact_id: string | null;
  deal_id: string | null;
  title: string;
  description: string | null;
  task_type: string;
  due_date: string;
  completed_at: string | null;
  assigned_to: string | null;
  created_by: string | null;
  priority: string;
  created_at: string | null;
  updated_at: string | null;
  // joined
  assignee?: { full_name: string | null; avatar_url: string | null } | null;
}

export interface TaskFilters {
  contact_id?: string;
  deal_id?: string;
  assigned_to?: string;
  completed?: boolean;
}

export function useTasks(filters?: TaskFilters) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["tasks", filters],
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("tasks")
        .select("*, assignee:profiles!tasks_assigned_to_fkey(full_name, avatar_url)")
        .order("due_date", { ascending: true });

      if (filters?.contact_id)  q = q.eq("contact_id", filters.contact_id);
      if (filters?.deal_id)     q = q.eq("deal_id", filters.deal_id);
      if (filters?.assigned_to) q = q.eq("assigned_to", filters.assigned_to);
      if (filters?.completed === true)  q = q.not("completed_at", "is", null);
      if (filters?.completed === false) q = q.is("completed_at", null);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Task[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("tasks-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const createTask = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (task: Omit<Task, "id" | "created_at" | "updated_at" | "assignee">) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("tasks").insert(task).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Task> & { id: string }) => {
      const { assignee: _a, ...cleanUpdates } = updates as Record<string, unknown>;
      void _a;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("tasks").update(cleanUpdates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const completeTask = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("tasks")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  return {
    tasks: query.data || [],
    isLoading: query.isLoading,
    createTask,
    updateTask,
    completeTask,
    deleteTask,
  };
}
