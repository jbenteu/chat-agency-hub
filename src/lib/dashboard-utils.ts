export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

export function calcVariation(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function periodLabel(key: string): string {
  const map: Record<string, string> = {
    hoje: "Hoje",
    ontem: "Ontem",
    "7d": "7 dias",
    "30d": "30 dias",
  };
  return map[key] ?? key;
}

export function getPeriodDates(key: string): { from: Date; to: Date } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000 - 1);

  switch (key) {
    case "hoje":
      return { from: startOfToday, to: endOfToday };
    case "ontem": {
      const from = new Date(startOfToday.getTime() - 86400000);
      const to = new Date(startOfToday.getTime() - 1);
      return { from, to };
    }
    case "7d": {
      const from = new Date(startOfToday.getTime() - 6 * 86400000);
      return { from, to: endOfToday };
    }
    case "30d":
    default: {
      const from = new Date(startOfToday.getTime() - 29 * 86400000);
      return { from, to: endOfToday };
    }
  }
}

export const CHART_COLORS = [
  "hsl(var(--primary))",
  "#22C55E",
  "#F59E0B",
  "#8B5CF6",
  "#EF4444",
  "#06B6D4",
  "#F97316",
];

export const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  landing_page: "Landing Page",
  indicacao: "Indicação",
};
