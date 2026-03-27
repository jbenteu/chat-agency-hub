import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Save } from "lucide-react";
import { useContacts, type Contact } from "@/hooks/use-contacts";
import { useCustomFieldDefinitions } from "@/hooks/use-custom-fields";
import { TagSelector } from "@/components/whatsapp/TagSelector";
import { CustomFieldRenderer } from "./CustomFieldRenderer";
import { BRAZIL_STATES } from "@/data/brazil-locations";
import { toast } from "sonner";

// ---- Input masks ----
function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function maskPhone(value: string): string {
  // Strip everything except digits
  let digits = value.replace(/\D/g, "");
  // If starts with country code, keep it; otherwise prepend 55
  if (!digits.startsWith("55") && digits.length > 0) {
    // If user types from scratch allow raw entry
  }
  digits = digits.slice(0, 13);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `+${digits}`;
  if (digits.length <= 4) return `+${digits.slice(0, 2)} (${digits.slice(2)}`;
  if (digits.length <= 9) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4)}`;
  return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
}

function formatPhoneForDisplay(rawPhone: string): string {
  if (!rawPhone) return "";
  // If already formatted, return as-is
  if (rawPhone.includes("(")) return rawPhone;
  // Raw digits - apply mask
  return maskPhone(rawPhone);
}

function maskCEP(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function maskInstagram(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._]/g, "");
  return cleaned ? `@${cleaned}` : "";
}

// ---- Field wrapper (defined OUTSIDE component to avoid remounts) ----
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}

// ---- Component ----
interface CRMContactDrawerDataProps {
  contact: Contact;
  onDirtyChange?: (dirty: boolean) => void;
}

export function CRMContactDrawerData({ contact, onDirtyChange }: CRMContactDrawerDataProps) {
  const { updateContact } = useContacts();
  const { fields: customFieldDefs } = useCustomFieldDefinitions("contact");
  const [customValues, setCustomValues] = useState<Record<string, unknown>>(
    (contact.custom_fields as Record<string, unknown>) || {}
  );

  const setCustomField = (key: string, value: unknown) =>
    setCustomValues((prev) => ({ ...prev, [key]: value }));

  const [form, setForm] = useState({
    name: contact.name || "",
    phone: formatPhoneForDisplay(contact.phone || ""),
    email: contact.email || "",
    company: contact.company || "",
    instagram: contact.instagram || "",
    cpf: contact.cpf || "",
    birthday: contact.birthday || "",
    gender: contact.gender || "",
    city: contact.city || "",
    state: contact.state || "",
    address: contact.address || "",
    zip_code: contact.zip_code || "",
    source: contact.source || "manual",
    source_detail: contact.source_detail || "",
    lifecycle_stage: contact.lifecycle_stage || "lead",
    tags: contact.tags || [],
  });

  const set = (key: keyof typeof form, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = () => {
    updateContact.mutate(
      { id: contact.id, ...form, custom_fields: customValues },
      {
        onSuccess: () => toast.success("Contato atualizado"),
        onError: () => toast.error("Erro ao atualizar contato"),
      }
    );
  };

  return (
    <div className="p-4 space-y-4">
      {/* Informações básicas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <FormField label="Nome *">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} className="h-8 text-sm" />
          </FormField>
        </div>
        <FormField label="Telefone">
          <Input
            value={form.phone}
            onChange={(e) => set("phone", maskPhone(e.target.value))}
            className="h-8 text-sm"
            placeholder="+55 (00) 00000-0000"
          />
        </FormField>
        <FormField label="E-mail">
          <Input value={form.email} onChange={(e) => set("email", e.target.value)} className="h-8 text-sm" type="email" placeholder="email@exemplo.com" />
        </FormField>
        <FormField label="Empresa">
          <Input value={form.company} onChange={(e) => set("company", e.target.value)} className="h-8 text-sm" />
        </FormField>
        <FormField label="Instagram">
          <Input
            value={form.instagram}
            onChange={(e) => set("instagram", maskInstagram(e.target.value))}
            className="h-8 text-sm"
            placeholder="@usuario"
          />
        </FormField>
        <FormField label="CPF">
          <Input
            value={form.cpf}
            onChange={(e) => set("cpf", maskCPF(e.target.value))}
            className="h-8 text-sm"
            placeholder="000.000.000-00"
          />
        </FormField>
        <FormField label="Aniversário">
          <Input value={form.birthday} onChange={(e) => set("birthday", e.target.value)} className="h-8 text-sm" type="date" />
        </FormField>
        <FormField label="Gênero">
          <Select value={form.gender || "nao_informado"} onValueChange={(v) => set("gender", v === "nao_informado" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nao_informado">Não informado</SelectItem>
              <SelectItem value="masculino">Masculino</SelectItem>
              <SelectItem value="feminino">Feminino</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <Separator />

      {/* Localização */}
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Localização</p>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Estado">
          <Select value={form.state || "none"} onValueChange={(v) => set("state", v === "none" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {BRAZIL_STATES.map((s) => <SelectItem key={s.uf} value={s.uf}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Cidade">
          <Input value={form.city} onChange={(e) => set("city", e.target.value)} className="h-8 text-sm" />
        </FormField>
        <FormField label="Endereço">
          <Input value={form.address} onChange={(e) => set("address", e.target.value)} className="h-8 text-sm" />
        </FormField>
        <FormField label="CEP">
          <Input
            value={form.zip_code}
            onChange={(e) => set("zip_code", maskCEP(e.target.value))}
            className="h-8 text-sm"
            placeholder="00000-000"
          />
        </FormField>
      </div>

      <Separator />

      {/* Origem */}
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Origem e Lifecycle</p>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Origem">
          <Select value={form.source || "manual"} onValueChange={(v) => set("source", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="landing_page">Landing Page</SelectItem>
              <SelectItem value="indicacao">Indicação</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Estágio de Vida">
          <Select value={form.lifecycle_stage || "lead"} onValueChange={(v) => set("lifecycle_stage", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="customer">Cliente</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <div className="col-span-2">
          <FormField label="Campanha de origem">
            <Input value={form.source_detail} onChange={(e) => set("source_detail", e.target.value)} className="h-8 text-sm" placeholder="UTM ou nome da campanha" />
          </FormField>
        </div>
      </div>

      <Separator />

      {/* Tags */}
      <FormField label="Tags">
        <TagSelector
          tags={form.tags}
          onChange={(tags) => set("tags", tags)}
        />
      </FormField>

      {/* Custom Fields */}
      {customFieldDefs.length > 0 && (
        <>
          <Separator />
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Campos Personalizados
          </p>
          <div className="grid grid-cols-2 gap-3">
            {customFieldDefs.map((def) => (
              <div key={def.id} className={def.field_type === "boolean" ? "col-span-2" : ""}>
                <CustomFieldRenderer
                  definition={def}
                  value={customValues[def.field_key]}
                  onChange={setCustomField}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Save */}
      <Button onClick={handleSave} disabled={updateContact.isPending} className="w-full" size="sm">
        <Save className="h-4 w-4 mr-2" />
        {updateContact.isPending ? "Salvando..." : "Salvar Alterações"}
      </Button>
    </div>
  );
}
