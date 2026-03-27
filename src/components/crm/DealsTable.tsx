import React, { useState, useMemo } from "react";
import { useDeals, type Deal } from "@/hooks/use-deals";
import { usePipeline } from "@/hooks/use-pipeline";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DealDetailSheet } from "./DealDetailSheet";
import { Search, Inbox, ChevronLeft, ChevronRight, ArrowUpDown, Package, X } from "lucide-react";
import { formatPhoneWhatsApp } from "@/data/country-codes";

type SortKey = "contact" | "value" | "created_at" | "stage";
type SortDir = "asc" | "desc";

export function DealsTable() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const PAGE_SIZE = 20;
  const { deals, isLoading } = useDeals();
  const { stages } = usePipeline();
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  const statusLabels: Record<string, string> = { open: "Aberto", won: "Ganho", lost: "Perdido" };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredDeals = useMemo(() => {
    let result = deals;

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(s) ||
          (d.contact?.name || "").toLowerCase().includes(s) ||
          (d.contact?.phone || "").includes(s)
      );
    }
    if (stageFilter) {
      result = result.filter((d) => d.stage === stageFilter);
    }
    if (statusFilter) {
      result = result.filter((d) => d.status === statusFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "contact":
          cmp = (a.contact?.name || "").localeCompare(b.contact?.name || "");
          break;
        case "value":
          cmp = (a.value || 0) - (b.value || 0);
          break;
        case "created_at":
          cmp = (a.created_at || "").localeCompare(b.created_at || "");
          break;
        case "stage":
          cmp = a.stage.localeCompare(b.stage);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [deals, search, stageFilter, statusFilter, sortKey, sortDir]);

  const hasFilters = !!(search || stageFilter || statusFilter);
  const totalPages = Math.max(1, Math.ceil(filteredDeals.length / PAGE_SIZE));
  const paginatedDeals = filteredDeals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const clearFilters = () => {
    setSearch("");
    setStageFilter("");
    setStatusFilter("");
    setPage(1);
  };

  const SortHeader = ({ label, sortKeyVal }: { label: string; sortKeyVal: SortKey }) => (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => toggleSort(sortKeyVal)}
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === sortKeyVal ? "text-foreground" : "text-muted-foreground/50"}`} />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar deals..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Estágio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos estágios</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="open">Aberto</SelectItem>
            <SelectItem value="won">Ganho</SelectItem>
            <SelectItem value="lost">Perdido</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <>
            <span className="text-xs text-muted-foreground">({filteredDeals.length} resultados)</span>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
              <X className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filteredDeals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Inbox className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum deal encontrado</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortHeader label="Contato" sortKeyVal="contact" /></TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead><SortHeader label="Estágio" sortKeyVal="stage" /></TableHead>
                  <TableHead><SortHeader label="Valor" sortKeyVal="value" /></TableHead>
                  <TableHead className="hidden md:table-cell">Produtos</TableHead>
                  <TableHead className="hidden lg:table-cell"><SortHeader label="Criado em" sortKeyVal="created_at" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDeals.map((deal) => {
                  const stageObj = stages.find((s) => s.name === deal.stage);
                  const itemsCount = deal.deal_items?.length || 0;
                  return (
                    <TableRow
                      key={deal.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedDeal(deal)}
                    >
                      <TableCell className="font-medium">{deal.contact?.name || deal.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {statusLabels[deal.status] || deal.status}
                        </Badge>
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
                      <TableCell className={`text-sm tabular-nums ${(deal.value || 0) > 0 ? "text-green-700 dark:text-green-400 font-medium" : "text-muted-foreground"}`}>
                        {(deal.value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {itemsCount > 0 ? (
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" /> {itemsCount}
                          </span>
                        ) : "—"}
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
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-muted-foreground">
                Página {page} de {totalPages} ({filteredDeals.length} deals)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <DealDetailSheet deal={selectedDeal} open={!!selectedDeal} onOpenChange={(o) => !o && setSelectedDeal(null)} />
    </div>
  );
}
