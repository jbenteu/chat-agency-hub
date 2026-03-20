import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Filter, Plus, X } from "lucide-react";

export interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

const FILTER_FIELDS = [
  { key: "contact_name", label: "Nome do contato" },
  { key: "phone", label: "Telefone" },
  { key: "email", label: "E-mail" },
  { key: "company", label: "Empresa" },
  { key: "stage", label: "Estágio" },
  { key: "status", label: "Status" },
  { key: "value", label: "Valor" },
  { key: "origin", label: "Origem" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "Estado" },
  { key: "tags", label: "Tags" },
];

const OPERATORS = [
  { key: "contains", label: "Contém" },
  { key: "equals", label: "Igual a" },
  { key: "not_equals", label: "Diferente de" },
  { key: "gt", label: "Maior que" },
  { key: "lt", label: "Menor que" },
];

interface Props {
  filters: FilterRule[];
  onChange: (filters: FilterRule[]) => void;
}

export function CRMFilters({ filters, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [newField, setNewField] = useState("contact_name");
  const [newOp, setNewOp] = useState("contains");
  const [newValue, setNewValue] = useState("");

  const addFilter = () => {
    if (!newValue.trim()) return;
    onChange([
      ...filters,
      { id: crypto.randomUUID(), field: newField, operator: newOp, value: newValue.trim() },
    ]);
    setNewValue("");
  };

  const removeFilter = (id: string) => {
    onChange(filters.filter((f) => f.id !== id));
  };

  const fieldLabel = (key: string) => FILTER_FIELDS.find((f) => f.key === key)?.label || key;
  const opLabel = (key: string) => OPERATORS.find((o) => o.key === key)?.label || key;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {filters.map((f) => (
        <Badge key={f.id} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
          <span className="text-xs">
            {fieldLabel(f.field)} {opLabel(f.operator).toLowerCase()} "{f.value}"
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); removeFilter(f.id); }}
            className="ml-1 rounded-full hover:bg-muted p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            Filtro
            {filters.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                {filters.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="start">
          <p className="text-xs font-medium text-muted-foreground mb-2">Adicionar filtro</p>
          <div className="space-y-2">
            <Select value={newField} onValueChange={setNewField}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_FIELDS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newOp} onValueChange={setNewOp}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map((o) => (
                  <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Valor..."
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="h-8 text-xs"
              onKeyDown={(e) => { if (e.key === "Enter") { addFilter(); setOpen(false); } }}
            />
            <Button size="sm" className="w-full gap-1" onClick={() => { addFilter(); setOpen(false); }}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
