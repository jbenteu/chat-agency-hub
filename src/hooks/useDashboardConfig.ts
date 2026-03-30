import { useState, useCallback } from "react";

export interface DashboardWidgetConfig {
  kpiLeads: boolean;
  kpiConversations: boolean;
  kpiMessages: boolean;
  kpiUnanswered: boolean;
  financialCards: boolean;
  evolution: boolean;
  funnel: boolean;
  leadsByStatus: boolean;
  tasks: boolean;
  recentActivity: boolean;
}

const DEFAULT_CONFIG: DashboardWidgetConfig = {
  kpiLeads: true,
  kpiConversations: true,
  kpiMessages: true,
  kpiUnanswered: true,
  financialCards: true,
  evolution: true,
  funnel: true,
  leadsByStatus: true,
  tasks: true,
  recentActivity: true,
};

const STORAGE_KEY = "dashboard-widget-config";

function loadConfig(): DashboardWidgetConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_CONFIG };
}

export function useDashboardConfig() {
  const [config, setConfig] = useState<DashboardWidgetConfig>(loadConfig);

  const toggle = useCallback((key: keyof DashboardWidgetConfig) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setConfig({ ...DEFAULT_CONFIG });
  }, []);

  return { config, toggle, resetToDefault };
}

export const WIDGET_LABELS: Record<keyof DashboardWidgetConfig, string> = {
  kpiLeads: "Leads Novos",
  kpiConversations: "Conversas Ativas",
  kpiMessages: "Msgs Recebidas",
  kpiUnanswered: "Sem Resposta",
  financialCards: "Cartões Financeiros",
  evolution: "Evolução de Leads",
  funnel: "Funil de Vendas",
  leadsByStatus: "Leads por Estágio",
  tasks: "Tarefas",
  recentActivity: "Atividade Recente",
};
