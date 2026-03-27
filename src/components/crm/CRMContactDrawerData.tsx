import React, { useState } from "react";
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

interface CRMContactDrawerDataProps {
  contact: Contact;
}

export function CRMContactDrawerData({ contact }: CRMContactDrawerDataProps) {
  const { updateContact } = useContacts();
  const { fields: customFieldDefs } = useCustomFieldDefinitions("contact");
  const [customValues, setCustomValues] = useState<Record<string, unknown>>(
    (contact.custom_fields as Record<string, unknown>) || {}
  );

  const setCustomField = (key: string, value: unknown) =>
    setCustomValues((prev) => ({ ...prev, [key]: value }));

  const [form, setForm] = useState({
    name: contact.name || "",
    phone: contact.phone || "",
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

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Informações básicas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Nome *">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} className="h-8 text-sm" />
          </Field>
        </div>
        <Field label="Telefone">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="h-8 text-sm" />
        </Field>
        <Field label="E-mail">
          <Input value={form.email} onChange={(e) => set("email", e.target.value)} className="h-8 text-sm" type="email" />
        </Field>
        <Field label="Empresa">
          <Input value={form.company} onChange={(e) => set("company", e.target.value)} className="h-8 text-sm" />
        </Field>
        <Field label="Instagram">
          <Input value={form.instagram} onChange={(e) => set("instagram", e.target.value)} className="h-8 text-sm" placeholder="@usuario" />
        </Field>
        <Field label="CPF">
          <Input value={form.cpf} onChange={(e) => set("cpf", e.target.value)} className="h-8 text-sm" placeholder="000.000.000-00" />
        </Field>
        <Field label="Aniversário">
          <Input value={form.birthday} onChange={(e) => set("birthday", e.target.value)} className="h-8 text-sm" type="date" />
        </Field>
        <Field label="Gênero">
          <Select value={form.gender || "nao_informado"} onValueChange={(v) => set("gender", v === "nao_informado" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nao_informado">Não informado</SelectItem>
              <SelectItem value="masculino">Masculino</SelectItem>
              <SelectItem value="feminino">Feminino</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Separator />

      {/* Localização */}
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Localização</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Estado">
          <Select value={form.state || "none"} onValueChange={(v) => set("state", v === "none" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {BRAZIL_STATES.map((s) => <SelectItem key={s.uf} value={s.uf}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Cidade">
          <Input value={form.city} onChange={(e) => set("city", e.target.value)} className="h-8 text-sm" />
        </Field>
        <Field label="Endereço">
          <Input value={form.address} onChange={(e) => set("address", e.target.value)} className="h-8 text-sm" />
        </Field>
        <Field label="CEP">
          <Input value={form.zip_code} onChange={(e) => set("zip_code", e.target.value)} className="h-8 text-sm" placeholder="00000-000" />
        </Field>
      </div>

      <Separator />

      {/* Origem */}
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Origem e Lifecycle</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Origem">
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
        </Field>
        <Field label="Estágio de Vida">
          <Select value={form.lifecycle_stage || "lead"} onValueChange={(v) => set("lifecycle_stage", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="customer">Cliente</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="col-span-2">
          <Field label="Campanha de origem">
            <Input value={form.source_detail} onChange={(e) => set("source_detail", e.target.value)} className="h-8 text-sm" placeholder="UTM ou nome da campanha" />
          </Field>
        </div>
      </div>

      <Separator />

      {/* Tags */}
      <Field label="Tags">
        <TagSelector
          tags={form.tags}
          onChange={(tags) => set("tags", tags)}
        />
      </Field>

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
