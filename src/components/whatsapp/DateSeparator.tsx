import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DateSeparatorProps {
  date: string;
}

function formatSeparatorDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return "Hoje";
  if (isYesterday(date)) return "Ontem";

  const now = new Date();
  const dayDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (dayDiff <= 7) return format(date, "EEEE", { locale: ptBR }).replace(/^\w/, (c) => c.toUpperCase());

  return format(date, "dd/MM/yyyy");
}

export function DateSeparator({ date }: DateSeparatorProps) {
  return (
    <div className="flex items-center justify-center py-2">
      <span className="rounded-lg bg-muted/80 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
        {formatSeparatorDate(date)}
      </span>
    </div>
  );
}

/** Returns the date key (YYYY-MM-DD) for grouping */
export function getDateKey(dateStr: string): string {
  return new Date(dateStr).toISOString().split("T")[0];
}
