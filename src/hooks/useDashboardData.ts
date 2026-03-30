import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getTenantId } from "@/hooks/use-contacts";

export interface DateRange {
  from: Date;
  to: Date;
}

export interface DashboardKPIs {
  newLeads: number;
  activeConversations: number;
  inboundMessages: number;
  unanswered: number;
}

export interface DashboardFinancials {
  wonValue: number;
  wonCount: number;
  conversionRate: number;
}

export interface StageCount {
  id: string;
  name: string;
  color: string | null;
  count: number;
  value: number;
}

export interface SourceCount {
  name: string;
  value: number;
}

export interface DayCount {
  date: string;
  leads: number;
}

export interface ActivityItem {
  id: string;
  type: string;
  content: string | null;
  created_at: string;
  contact_id: string | null;
  deal_id: string | null;
}

export interface TaskItem {
  id: string;
  title: string;
  task_type: string;
  due_date: string;
  priority: string;
  contact_id: string | null;
  deal_id: string | null;
}

export function useDashboardData(range: DateRange) {
  const fromISO = range.from.toISOString();
  const toISO = range.to.toISOString();

  const kpis = useQuery<DashboardKPIs>({
    queryKey: ["dashboard-kpis", fromISO, toISO],
    queryFn: async () => {
      const tenantId = await getTenantId();

      // "Sem Resposta": conversations where the last message is from the client
      // (inbound) and was sent within the last 30 days.
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [leadsRes, convsRes, msgsRes, recentConvsRes] = await Promise.all([
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        supabase
          .from("whatsapp_conversations")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "open"),
        supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("direction", "inbound")
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        // Fetch conversations with activity in last 30 days for "sem resposta" calc
        supabase
          .from("whatsapp_conversations")
          .select("id")
          .eq("tenant_id", tenantId)
          .gte("last_message_at", thirtyDaysAgo),
      ]);

      // Calculate "Sem Resposta": conversations where the last message is inbound
      const recentConvIds = (recentConvsRes.data || []).map((c) => c.id);
      let unanswered = 0;
      if (recentConvIds.length > 0) {
        const { data: msgs } = await supabase
          .from("whatsapp_messages")
          .select("conversation_id, direction, created_at")
          .in("conversation_id", recentConvIds)
          .order("created_at", { ascending: false });

        // Find the direction of the last message per conversation
        const lastDir: Record<string, string> = {};
        for (const msg of msgs || []) {
          if (!(msg.conversation_id in lastDir)) {
            lastDir[msg.conversation_id] = msg.direction as string;
          }
        }
        unanswered = Object.values(lastDir).filter((d) => d === "inbound").length;
      }

      return {
        newLeads: leadsRes.count ?? 0,
        activeConversations: convsRes.count ?? 0,
        inboundMessages: msgsRes.count ?? 0,
        unanswered,
      };
    },
    staleTime: 30_000,
  });

  const financials = useQuery<DashboardFinancials>({
    queryKey: ["dashboard-financials", fromISO, toISO],
    queryFn: async () => {
      const tenantId = await getTenantId();

      // Won deals in the period (vendas realizadas)
      const [wonInPeriodRes, contactsInPeriodRes] = await Promise.all([
        supabase
          .from("deals")
          .select("value")
          .eq("tenant_id", tenantId)
          .eq("status", "won")
          .gte("closed_at", fromISO)
          .lte("closed_at", toISO),
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
      ]);

      const wonDeals = wonInPeriodRes.data || [];
      const wonValue = wonDeals.reduce((s, d) => s + (d.value || 0), 0);
      const wonCount = wonDeals.length;

      // Conversion rate = (conversões / visitantes) * 100
      // conversões = won deals in period
      // visitantes = new contacts/leads in period
      const totalLeads = contactsInPeriodRes.count ?? 0;
      const conversionRate = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0;

      return { wonValue, wonCount, conversionRate };
    },
    staleTime: 30_000,
  });

  const funnel = useQuery<StageCount[]>({
    queryKey: ["dashboard-funnel"],
    queryFn: async () => {
      const tenantId = await getTenantId();

      const [stagesRes, dealsRes] = await Promise.all([
        supabase
          .from("pipeline_stages")
          .select("id, name, color, order")
          .eq("tenant_id", tenantId)
          .order("order"),
        supabase
          .from("deals")
          .select("pipeline_stage_id, value, status")
          .eq("tenant_id", tenantId)
          .neq("status", "lost"),
      ]);

      const stages = stagesRes.data || [];
      const deals = dealsRes.data || [];

      return stages.map((s) => {
        const stageDeals = deals.filter((d) => d.pipeline_stage_id === s.id);
        return {
          id: s.id,
          name: s.name,
          color: s.color,
          count: stageDeals.length,
          value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
        };
      });
    },
    staleTime: 30_000,
  });

  const evolution = useQuery<DayCount[]>({
    queryKey: ["dashboard-evolution", fromISO, toISO],
    queryFn: async () => {
      const tenantId = await getTenantId();
      const { data } = await supabase
        .from("contacts")
        .select("created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);

      const counts: Record<string, number> = {};

      // Build all days in range
      const from = new Date(range.from);
      const to = new Date(range.to);
      const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      while (cur <= to) {
        const key = cur.toISOString().slice(0, 10);
        counts[key] = 0;
        cur.setDate(cur.getDate() + 1);
      }

      for (const c of data || []) {
        const key = (c.created_at as string).slice(0, 10);
        if (key in counts) counts[key]++;
      }

      return Object.entries(counts).map(([date, leads]) => ({ date, leads }));
    },
    staleTime: 30_000,
  });

  const activities = useQuery<ActivityItem[]>({
    queryKey: ["dashboard-activities"],
    queryFn: async () => {
      const tenantId = await getTenantId();
      const { data } = await supabase
        .from("activities")
        .select("id, type, content, created_at, contact_id, deal_id")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []) as ActivityItem[];
    },
    staleTime: 30_000,
  });

  const tasks = useQuery<TaskItem[]>({
    queryKey: ["dashboard-tasks"],
    queryFn: async () => {
      const tenantId = await getTenantId();
      const { data } = await supabase
        .from("tasks")
        .select("id, title, task_type, due_date, priority, contact_id, deal_id")
        .eq("tenant_id", tenantId)
        .is("completed_at", null)
        .order("due_date", { ascending: true })
        .limit(10);
      return (data || []) as TaskItem[];
    },
    staleTime: 30_000,
  });

  return { kpis, financials, funnel, evolution, activities, tasks };
}
