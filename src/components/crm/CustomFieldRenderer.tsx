import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { CustomFieldDefinition } from "@/hooks/use-custom-fields";

interface CustomFieldRendererProps {
  definition: CustomFieldDefinition;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}

export function CustomFieldRenderer({ definition, value, onChange, readOnly = false }: CustomFieldRendererProps) {
  const { field_key, field_label, field_type, field_options, placeholder, is_required } = definition;

  const labelEl = (
    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
      {field_label}{is_required ? " *" : ""}
    </Label>
  );

  if (readOnly) {
    const displayValue = formatFieldValue(value, field_type);
    return (
      <div className="space-y-0.5">
        {labelEl}
        <p className="text-sm">{displayValue || <span className="text-muted-foreground">—</span>}</p>
      </div>
    );
  }

  switch (field_type) {
    case "boolean":
      return (
        <div className="flex items-center justify-between">
          {labelEl}
          <Switch
            checked={!!value}
            onCheckedChange={(v) => onChange(field_key, v)}
          />
        </div>
      );

    case "select":
      return (
        <div className="space-y-1">
          {labelEl}
          <Select
            value={String(value || "")}
            onValueChange={(v) => onChange(field_key, v === "__none__" ? null : v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={placeholder || "Selecionar..."} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Nenhum</SelectItem>
              {(field_options || []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case "multi_select": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1">
          {labelEl}
          <div className="flex flex-wrap gap-1 min-h-[32px] rounded-md border border-input bg-background px-2 py-1">
            {selected.map((v) => (
              <Badge key={v} variant="secondary" className="h-5 gap-1 text-[10px] px-1.5">
                {v}
                <button
                  onClick={() => onChange(field_key, selected.filter((s) => s !== v))}
                  className="hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
            <Select
              value=""
              onValueChange={(v) => {
                if (!selected.includes(v)) onChange(field_key, [...selected, v]);
              }}
            >
              <SelectTrigger className="h-5 w-auto border-none shadow-none px-1 text-[10px] text-muted-foreground">
                <span>+ Adicionar</span>
              </SelectTrigger>
              <SelectContent>
                {(field_options || [])
                  .filter((opt) => !selected.includes(opt))
                  .map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }

    case "date":
      return (
        <div className="space-y-1">
          {labelEl}
          <Input
            type="date"
            value={String(value || "")}
            onChange={(e) => onChange(field_key, e.target.value || null)}
            className="h-8 text-sm"
          />
        </div>
      );

    case "number":
      return (
        <div className="space-y-1">
          {labelEl}
          <Input
            type="number"
            value={String(value ?? "")}
            onChange={(e) => onChange(field_key, e.target.value ? Number(e.target.value) : null)}
            placeholder={placeholder || ""}
            className="h-8 text-sm"
          />
        </div>
      );

    case "currency":
      return (
        <div className="space-y-1">
          {labelEl}
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            <Input
              type="number"
              step="0.01"
              value={String(value ?? "")}
              onChange={(e) => onChange(field_key, e.target.value ? Number(e.target.value) : null)}
              placeholder="0,00"
              className="h-8 text-sm pl-8"
            />
          </div>
        </div>
      );

    default: // text, phone, email, url
      return (
        <div className="space-y-1">
          {labelEl}
          <Input
            type={field_type === "email" ? "email" : field_type === "url" ? "url" : "text"}
            value={String(value || "")}
            onChange={(e) => onChange(field_key, e.target.value || null)}
            placeholder={placeholder || ""}
            className="h-8 text-sm"
          />
        </div>
      );
  }
}

function formatFieldValue(value: unknown, type: string): string {
  if (value === null || value === undefined || value === "") return "";
  if (type === "boolean") return value ? "Sim" : "Não";
  if (type === "currency") return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (type === "date") return new Date(String(value)).toLocaleDateString("pt-BR");
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
