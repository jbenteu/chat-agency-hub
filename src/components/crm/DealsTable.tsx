import React, { useState, useMemo } from "react";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DealDetailSheet } from "./DealDetailSheet";
import { CRMFilters, type FilterRule } from "./CRMFilters";
import { Search, Inbox, Settings2, ChevronLeft, ChevronRight } from "lucide-react";
import { formatPhoneWhatsApp } from "@/data/country-codes";

interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "contact", label: "Contato", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "stage", label: "Estágio", defaultVisible: true },
  { key: "value", label: "Valor", defaultVisible: true },
  { key: "deal_title", label: "Título do Deal", defaultVisible: false },
  { key: "phone", label: "Telefone", defaultVisible: false },
  { key: "email", label: "E-mail", defaultVisible: false },
  { key: "company", label: "Empresa", defaultVisible: false },
  { key: "tags", label: "Tags", defaultVisible: false },
  { key: "origin", label: "Origem", defaultVisible: false },
  { key: "city_state", label: "Cidade/Estado", defaultVisible: false },
  { key: "created_at", label: "Criado em", defaultVisible: false },
];

const STORAGE_KEY = "crm_deals_columns";

function getStoredColumns(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore parse errors */ }
  return ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key);
}

function storeColumns(cols: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cols));
}

export function DealsTable() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState<FilterRule[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(getStoredColumns);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const { deals, isLoading } = useDeals();
  const { stages } = usePipeline();
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  const statusLabels: Record<string, string> = { open: "Aberto", won: "Ganho", lost: "Perdido" };

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      storeColumns(next);
      return next;
    });
  };

  const filteredDeals = useMemo(() => {
    let result = deals;

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(s) ||
          (d.contact?.name || "").toLowerCase().includes(s) ||
          (d.contact?.phone || "").includes(s) ||
          (d.contact?.email || "").toLowerCase().includes(s) ||
          (d.contact?.company || "").toLowerCase().includes(s)
      );
    }

    if (stageFilter) {
      result = result.filter((d) => d.stage === stageFilter || d.pipeline_stage_id === stageFilter);
    }

    if (statusFilter) {
      result = result.filter((d) => d.status === statusFilter);
    }

    if (advancedFilters.length > 0) {
      result = result.filter((deal) =>
        advancedFilters.every((filter) => {
          const val = getFieldValue(deal, filter.field);
          const target = filter.value.toLowerCase();
          switch (filter.operator) {
            case "contains": return val.toLowerCase().includes(target);
            case "equals": return val.toLowerCase() === target;
            case "not_equals": return val.toLowerCase() !== target;
            case "gt": return parseFloat(val) > parseFloat(filter.value);
            case "lt": return parseFloat(val) < parseFloat(filter.value);
            default: return true;
          }
        })
      );
    }

    return result;
  }, [deals, search, stageFilter, statusFilter, advancedFilters]);

  const totalPages = Math.max(1, Math.ceil(filteredDeals.length / PAGE_SIZE));
  const paginatedDeals = filteredDeals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const isVisible = (key: string) => visibleColumns.includes(key);

  const renderCell = (deal: Deal, key: string) => {
    const stageObj = stages.find((s) => s.name === deal.stage || s.id === deal.pipeline_stage_id);
    switch (key) {
      case "contact":
        return <span className="font-medium">{deal.contact?.name || "—"}</span>;
      case "deal_title":
        return <span className="text-sm">{deal.title}</span>;
      case "value":
        return (
          <span className="text-sm tabular-nums">
            {(deal.value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        );
      case "stage":
        return (
          <Badge
            variant="secondary"
            className="text-[10px]"
            style={stageObj ? { backgroundColor: `${stageObj.color}20`, color: stageObj.color! } : undefined}
          >
            {deal.stage}
          </Badge>
        );
      case "status":
        return (
          <Badge variant="outline" className="text-[10px]">
            {statusLabels[deal.status] || deal.status}
          </Badge>
        );
      case "phone":
        return <span className="text-sm">{formatPhoneWhatsApp(deal.contact?.phone)}</span>;
      case "email":
        return <span className="text-sm">{deal.contact?.email || "—"}</span>;
      case "company":
        return <span className="text-sm">{deal.contact?.company || "—"}</span>;
      case "tags":
        return (
          <div className="flex flex-wrap gap-1">
            {(deal.contact?.tags || []).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
            ))}
            {(!deal.contact?.tags || deal.contact.tags.length === 0) && <span className="text-sm text-muted-foreground">—</span>}
          </div>
        );
      case "origin":
        return <Badge variant="secondary" className="text-[10px]">{deal.contact?.origin || "manual"}</Badge>;
      case "city_state":
        return (
          <span className="text-sm">
            {[deal.contact?.city, deal.contact?.state].filter(Boolean).join(", ") || "—"}
          </span>
        );
      case "created_at":
        return (
          <span className="text-sm text-muted-foreground">
            {deal.created_at ? new Date(deal.created_at).toLocaleDateString("pt-BR") : "—"}
          </span>
        );
      default:
        return null;
    }
  };

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

        <CRMFilters filters={advancedFilters} onChange={(f) => { setAdvancedFilters(f); setPage(1); }} />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              Colunas
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="end">
            <p className="text-xs font-medium text-muted-foreground mb-2">Colunas visíveis</p>
            <div className="space-y-2">
              {ALL_COLUMNS.map((col) => (
                <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={visibleColumns.includes(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
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
          <div className="text-xs text-muted-foreground mb-1">
            {filteredDeals.length} resultado{filteredDeals.length !== 1 ? "s" : ""}
            {filteredDeals.length > PAGE_SIZE && ` — página ${page} de ${totalPages}`}
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {ALL_COLUMNS.filter((c) => isVisible(c.key)).map((col) => (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDeals.map((deal) => (
                  <TableRow
                    key={deal.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedDeal(deal)}
                  >
                    {ALL_COLUMNS.filter((c) => isVisible(c.key)).map((col) => (
                      <TableCell key={col.key}>{renderCell(deal, col.key)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <DealDetailSheet deal={selectedDeal} open={!!selectedDeal} onOpenChange={(o) => !o && setSelectedDeal(null)} />
    </div>
  );
}

function getFieldValue(deal: Deal, field: string): string {
  switch (field) {
    case "contact_name": return deal.contact?.name || "";
    case "phone": return deal.contact?.phone || "";
    case "email": return deal.contact?.email || "";
    case "company": return deal.contact?.company || "";
    case "stage": return deal.stage || "";
    case "status": return deal.status || "";
    case "value": return String(deal.value || 0);
    case "origin": return deal.contact?.origin || "";
    case "city": return deal.contact?.city || "";
    case "state": return deal.contact?.state || "";
    case "tags": return (deal.contact?.tags || []).join(", ");
    default: return "";
  }
}
