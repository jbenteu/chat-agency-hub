import React, { useState } from "react";
import { useDeals, type Deal } from "@/hooks/use-deals";
import { usePipeline } from "@/hooks/use-pipeline";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DealDetailSheet } from "./DealDetailSheet";
import { Search, Inbox } from "lucide-react";

export function DealsTable() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const { deals, isLoading } = useDeals({
    search: search || undefined,
    stage: stageFilter || undefined,
  });
  const { stages } = usePipeline();
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  const statusLabels: Record<string, string> = { open: "Aberto", won: "Ganho", lost: "Perdido" };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar deals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={stageFilter} onValueChange={(v) => setStageFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Estágio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : deals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Inbox className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum deal encontrado</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contato</TableHead>
                <TableHead>Deal</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Estágio</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Criado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deals.map((deal) => {
                const stageObj = stages.find((s) => s.name === deal.stage || s.id === deal.pipeline_stage_id);
                return (
                  <TableRow
                    key={deal.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedDeal(deal)}
                  >
                    <TableCell className="font-medium">{deal.contact?.name || "—"}</TableCell>
                    <TableCell className="text-sm">{deal.title}</TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {(deal.value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="text-[10px]"
                        style={stageObj ? { backgroundColor: `${stageObj.color}20`, color: stageObj.color! } : undefined}
                      >
                        {deal.stage}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline" className="text-[10px]">
                        {statusLabels[deal.status] || deal.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {deal.created_at ? new Date(deal.created_at).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <DealDetailSheet deal={selectedDeal} open={!!selectedDeal} onOpenChange={(o) => !o && setSelectedDeal(null)} />
    </div>
  );
}
