import { useState, useEffect, useCallback } from "react";
import { useEvolutionApi, type Conversation, type WhatsAppMessage } from "@/hooks/use-evolution-api";
import { TagSelector } from "@/components/whatsapp/TagSelector";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import type { GroupInfo } from "@/hooks/use-inbox-cache";
import { getCustomOrigins, getCustomLifecycleStages } from "@/components/crm/CRMSettingsDialog";
import { NewDealDialog } from "@/components/crm/NewDealDialog";
import { usePipeline } from "@/hooks/use-pipeline";
import { useDeals } from "@/hooks/use-deals";
import {
  X, Edit2, Check, Loader2, MessageCircle, Phone, Mail, Building2, MapPin,
  Clock, Tag, Link2, Copy, Users, ShieldCheck, Crown, UserMinus, ChevronUp,
  ChevronDown, Image as ImageIcon, FileText, Video, Instagram, ShoppingBag,
  User, Calendar, CreditCard, Briefcase,
} from "lucide-react";
import { format } from "date-fns";
import { formatPhoneWhatsApp, formatPhoneEdit, maskPhoneInput, detectCountryCode, COUNTRY_CODES } from "@/data/country-codes";
import { BRAZIL_STATES, BRAZIL_CITIES } from "@/data/brazil-locations";

interface ContactDetails {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  tags: string[];
  custom_fields: Record<string, string>;
  created_at: string;
  // CRM fields
  city: string | null;
  state: string | null;
  address: string | null;
  instagram: string | null;
  cpf: string | null;
  birthday: string | null;
  gender: string | null;
  zip_code: string | null;
  source: string | null;
  source_detail: string | null;
  lifecycle_stage: string | null;
  origin: string | null;
}

interface InfoPanelProps {
  conversation: Conversation;
  profilePicUrl?: string;
  profilePics: Record<string, string>;
  groupInfo?: GroupInfo;
  instanceName: string;
  instanceDisplayName?: string;
  messages: WhatsAppMessage[];
  onClose: () => void;
}

export function InfoPanel({
  conversation, profilePicUrl, profilePics, groupInfo, instanceName, instanceDisplayName, messages, onClose,
}: InfoPanelProps) {
  const { toast } = useToast();
  const {
    getContact, updateContact, getGroupInviteLink,
    removeGroupParticipant, promoteGroupParticipant, demoteGroupParticipant,
  } = useEvolutionApi();

  const isGroup = conversation.remote_jid.endsWith("@g.us");
  const [contactDetails, setContactDetails] = useState<ContactDetails | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [phoneCountryCode, setPhoneCountryCode] = useState("+55");
  const [phoneCountryOpen, setPhoneCountryOpen] = useState(false);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const { stages } = usePipeline();
  const { deals } = useDeals();

  // Load contact details directly from Supabase for full CRM data
  useEffect(() => {
    if (isGroup || !conversation.contact_id) return;
    const load = async () => {
      try {
        const { data } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", conversation.contact_id!)
          .single();
        if (data) {
          setContactDetails({
            id: data.id,
            name: data.name,
            email: data.email,
            phone: data.phone,
            company: data.company,
            notes: data.notes,
            tags: data.tags || [],
            custom_fields: (data.custom_fields as Record<string, string>) || {},
            created_at: data.created_at || "",
            city: data.city,
            state: data.state,
            address: data.address,
            instagram: (data.custom_fields as any)?.instagram || null,
            cpf: (data.custom_fields as any)?.cpf || null,
            birthday: (data.custom_fields as any)?.birthday || null,
            gender: (data.custom_fields as any)?.gender || null,
            zip_code: (data.custom_fields as any)?.zip_code || null,
            source: (data.custom_fields as any)?.source || data.origin || null,
            source_detail: (data.custom_fields as any)?.source_detail || null,
            lifecycle_stage: (data.custom_fields as any)?.lifecycle_stage || null,
            origin: data.origin,
          });
        }
      } catch {}
    };
    load();
  }, [conversation.contact_id, isGroup]);

  const sharedMedia = messages.filter(
    (m) => m.media_type && ["image", "video", "sticker"].includes(m.media_type)
  );
  const sharedDocs = messages.filter((m) => m.media_type === "document");

  const contactDeals = contactDetails ? deals.filter((d) => d.contact_id === contactDetails.id) : [];

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((p) => p[0]).join("").substring(0, 2).toUpperCase();
  };

  const formatFullDate = (d: string) => {
    try { return format(new Date(d), "dd/MM/yyyy 'às' HH:mm"); } catch { return ""; }
  };

  const startEditing = useCallback(() => {
    if (!contactDetails) return;
    const origins = getCustomOrigins();
    const lifecycles = getCustomLifecycleStages();
    setForm({
      name: contactDetails.name || "",
      email: contactDetails.email || "",
      phone: formatPhoneEdit(contactDetails.phone),
      company: contactDetails.company || "",
      notes: contactDetails.notes || "",
      address: contactDetails.address || contactDetails.custom_fields?.address || "",
      state: contactDetails.state || contactDetails.custom_fields?.state || "",
      city: contactDetails.city || contactDetails.custom_fields?.city || "",
      instagram: contactDetails.instagram || "",
      cpf: contactDetails.cpf || "",
      birthday: contactDetails.birthday || "",
      gender: contactDetails.gender || "",
      zip_code: contactDetails.zip_code || "",
      source: contactDetails.source || "manual",
      source_detail: contactDetails.source_detail || "",
      lifecycle_stage: contactDetails.lifecycle_stage || "lead",
      tags: contactDetails.tags?.join(",") || "",
    });
    setPhoneCountryCode(detectCountryCode(contactDetails.phone));
    setEditing(true);
  }, [contactDetails]);

  const saveContact = async () => {
    if (!contactDetails) return;
    setSaving(true);
    try {
      const phoneDigits = form.phone?.replace(/\D/g, "") || "";
      const fullPhone = phoneDigits ? `${phoneCountryCode}${phoneDigits}` : contactDetails.phone;
      const tags = form.tags ? form.tags.split(",").filter(Boolean) : [];
      
      // Update directly via Supabase for full CRM sync
      const { error } = await supabase
        .from("contacts")
        .update({
          name: form.name,
          email: form.email || null,
          phone: fullPhone,
          company: form.company || null,
          notes: form.notes || null,
          tags,
          city: form.city || null,
          state: form.state || null,
          address: form.address || null,
          custom_fields: {
            ...contactDetails.custom_fields,
            instagram: form.instagram || null,
            cpf: form.cpf || null,
            birthday: form.birthday || null,
            gender: form.gender || null,
            zip_code: form.zip_code || null,
            source: form.source || null,
            source_detail: form.source_detail || null,
            lifecycle_stage: form.lifecycle_stage || null,
          },
        } as never)
        .eq("id", contactDetails.id);

      if (error) throw error;

      setContactDetails((prev) => prev ? {
        ...prev,
        name: form.name, email: form.email || null, phone: fullPhone,
        company: form.company || null, notes: form.notes || null, tags,
        city: form.city || null, state: form.state || null, address: form.address || null,
        instagram: form.instagram || null, cpf: form.cpf || null,
        birthday: form.birthday || null, gender: form.gender || null,
        zip_code: form.zip_code || null, source: form.source || null,
        source_detail: form.source_detail || null, lifecycle_stage: form.lifecycle_stage || null,
        custom_fields: {
          ...prev.custom_fields,
          instagram: form.instagram || "", cpf: form.cpf || "",
          birthday: form.birthday || "", gender: form.gender || "",
          zip_code: form.zip_code || "", source: form.source || "",
          source_detail: form.source_detail || "", lifecycle_stage: form.lifecycle_stage || "",
        },
      } : prev);
      setEditing(false);
      toast({ title: "Contato atualizado" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTag = async (name: string, color: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: roles } = await supabase.from("user_roles").select("tenant_id").eq("user_id", user.id).limit(1).single();
    if (!roles?.tenant_id) return;
    await supabase.from("tags").insert({ name, color, tenant_id: roles.tenant_id });
  };

  const handleGetInviteLink = async () => {
    setLoadingInvite(true);
    try {
      const data = await getGroupInviteLink(instanceName, conversation.remote_jid);
      if (data?.inviteUrl) setInviteLink(data.inviteUrl);
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    } finally {
      setLoadingInvite(false);
    }
  };

  const origins = getCustomOrigins();
  const lifecycleStages = getCustomLifecycleStages();

  return (
    <div className="w-80 border-l border-border overflow-hidden flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">
          {isGroup ? "Detalhes do grupo" : "Contato"}
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Avatar & Name */}
          <div className="flex flex-col items-center text-center">
            <Avatar className="mb-2 h-16 w-16">
              {profilePicUrl && <AvatarImage src={profilePicUrl} alt={conversation.contact_name || ""} />}
              <AvatarFallback className="bg-primary/10 text-lg text-primary">
                {isGroup ? <Users className="h-7 w-7" /> : getInitials(conversation.contact_name)}
              </AvatarFallback>
            </Avatar>
            <p className="text-sm font-semibold">{conversation.contact_name || "Desconhecido"}</p>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Criado {formatFullDate(conversation.created_at)}</span>
            </div>
          </div>

          {isGroup ? (
            <>
              {groupInfo?.description && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-1 text-xs font-medium">Descrição</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{groupInfo.description}</p>
                  </div>
                </>
              )}

              <Separator />

              <div>
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleGetInviteLink} disabled={loadingInvite}>
                  {loadingInvite ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Link2 className="mr-1.5 h-3 w-3" />}
                  Gerar link de convite
                </Button>
                {inviteLink && (
                  <div className="mt-2 flex items-center gap-1 rounded bg-muted p-2">
                    <p className="flex-1 truncate text-[10px] text-muted-foreground">{inviteLink}</p>
                    <button onClick={() => { navigator.clipboard.writeText(inviteLink); toast({ title: "Copiado!" }); }} className="shrink-0 p-1 hover:bg-accent rounded">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {groupInfo?.participants && groupInfo.participants.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-2 text-xs font-medium">{groupInfo.participants.length} participantes</p>
                    <div className="space-y-1 max-h-[400px] overflow-y-auto">
                      {groupInfo.participants.map((p, idx) => (
                        <div key={p.id || idx} className="group/p flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/50">
                          <Avatar className="h-7 w-7 shrink-0">
                            {p.phone && profilePics[`${p.phone}@s.whatsapp.net`] && <AvatarImage src={profilePics[`${p.phone}@s.whatsapp.net`]} />}
                            <AvatarFallback className="bg-muted text-[10px]">{(p.phone || "?").slice(-2)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 overflow-hidden">
                            <p className="text-xs truncate">{p.phone || p.id}</p>
                          </div>
                          {p.admin === "admin" && <span title="Admin"><ShieldCheck className="h-3 w-3 text-primary shrink-0" /></span>}
                          {p.admin === "superadmin" && <span title="Super Admin"><Crown className="h-3 w-3 text-primary shrink-0" /></span>}
                          <div className="hidden group-hover/p:flex items-center gap-0.5 shrink-0">
                            {!p.admin && (
                              <button title="Promover a admin" onClick={() => promoteGroupParticipant(instanceName, conversation.remote_jid, p.id).catch(() => {})} className="p-0.5 rounded hover:bg-accent">
                                <ChevronUp className="h-3 w-3 text-muted-foreground" />
                              </button>
                            )}
                            {p.admin === "admin" && (
                              <button title="Remover admin" onClick={() => demoteGroupParticipant(instanceName, conversation.remote_jid, p.id).catch(() => {})} className="p-0.5 rounded hover:bg-accent">
                                <ChevronUp className="h-3 w-3 text-muted-foreground rotate-180" />
                              </button>
                            )}
                            <button title="Remover do grupo" onClick={() => removeGroupParticipant(instanceName, conversation.remote_jid, p.id).catch(() => {})} className="p-0.5 rounded hover:bg-destructive/10">
                              <UserMinus className="h-3 w-3 text-destructive" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <Separator />

              {/* Action icons */}
              <div className="flex items-center justify-center gap-3">
                <button title="Editar" onClick={startEditing} className="flex h-8 w-8 items-center justify-center rounded-md bg-muted hover:bg-accent transition-colors">
                  <Edit2 className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              <Separator />

              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Nome</label>
                    <Input className="h-7 text-xs mt-0.5" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Telefone</label>
                    <div className="flex gap-1 mt-0.5">
                      <Popover open={phoneCountryOpen} onOpenChange={setPhoneCountryOpen}>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-0.5 h-7 px-1.5 rounded-md border border-input bg-background text-xs shrink-0 hover:bg-accent">
                            <span>{COUNTRY_CODES.find((c) => c.dial === phoneCountryCode)?.flag || "🇧🇷"}</span>
                            <span className="text-[10px] text-muted-foreground">{phoneCountryCode}</span>
                            <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-1" align="start">
                          <div className="max-h-48 overflow-y-auto">
                            {COUNTRY_CODES.map((c) => (
                              <button key={c.code} onClick={() => { setPhoneCountryCode(c.dial); setPhoneCountryOpen(false); }}
                                className="flex items-center gap-2 w-full rounded px-2 py-1 text-xs hover:bg-muted">
                                <span>{c.flag}</span>
                                <span className="flex-1 text-left">{c.name}</span>
                                <span className="text-muted-foreground">{c.dial}</span>
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Input className="h-7 text-xs flex-1" placeholder="(XX) XXXXX-XXXX" value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: maskPhoneInput(e.target.value) }))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">E-mail</label>
                    <Input className="h-7 text-xs mt-0.5" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Empresa</label>
                    <Input className="h-7 text-xs mt-0.5" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Instagram</label>
                    <Input className="h-7 text-xs mt-0.5" value={form.instagram} onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))} placeholder="@usuario" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">CPF</label>
                    <Input className="h-7 text-xs mt-0.5" value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Aniversário</label>
                    <Input className="h-7 text-xs mt-0.5" type="date" value={form.birthday} onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Gênero</label>
                    <Select value={form.gender || "nao_informado"} onValueChange={(v) => setForm((f) => ({ ...f, gender: v === "nao_informado" ? "" : v }))}>
                      <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nao_informado">Não informado</SelectItem>
                        <SelectItem value="masculino">Masculino</SelectItem>
                        <SelectItem value="feminino">Feminino</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Localização</p>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Estado</label>
                    <Select value={form.state || "none"} onValueChange={(v) => setForm((f) => ({ ...f, state: v === "none" ? "" : v, city: "" }))}>
                      <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {BRAZIL_STATES.map((s) => <SelectItem key={s.uf} value={s.uf}>{s.uf} - {s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Cidade</label>
                    <Select value={form.city || "none"} onValueChange={(v) => setForm((f) => ({ ...f, city: v === "none" ? "" : v }))} disabled={!form.state}>
                      <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue placeholder={form.state ? "Selecione" : "Selecione o estado"} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {(BRAZIL_CITIES[form.state] || []).map((city) => <SelectItem key={city} value={city}>{city}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Endereço</label>
                    <Input className="h-7 text-xs mt-0.5" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">CEP</label>
                    <Input className="h-7 text-xs mt-0.5" value={form.zip_code} onChange={(e) => setForm((f) => ({ ...f, zip_code: e.target.value }))} placeholder="00000-000" />
                  </div>

                  <Separator />
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">Origem e Lifecycle</p>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Origem</label>
                    <Select value={form.source || "manual"} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                      <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {origins.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Estágio de Vida</label>
                    <Select value={form.lifecycle_stage || "lead"} onValueChange={(v) => setForm((f) => ({ ...f, lifecycle_stage: v }))}>
                      <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {lifecycleStages.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Campanha de origem</label>
                    <Input className="h-7 text-xs mt-0.5" value={form.source_detail} onChange={(e) => setForm((f) => ({ ...f, source_detail: e.target.value }))} placeholder="UTM ou nome da campanha" />
                  </div>

                  <Separator />
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Tags</label>
                    <div className="mt-0.5">
                      <TagSelector
                        tags={form.tags ? form.tags.split(",").filter(Boolean) : (contactDetails?.tags || [])}
                        onChange={(newTags) => setForm((f) => ({ ...f, tags: newTags.join(",") }))}
                        onCreateTag={handleCreateTag}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 h-7 text-xs" onClick={saveContact} disabled={saving}>
                      {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />} Salvar
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Phone */}
                  <div className="flex items-center gap-2 text-xs">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{formatPhoneWhatsApp(conversation.contact_phone)}</span>
                  </div>
                  {/* Email */}
                  <div className="flex items-center gap-2 text-xs">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{contactDetails?.email || "Indisponível"}</span>
                  </div>
                  {/* Company */}
                  <div className="flex items-center gap-2 text-xs">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{contactDetails?.company || "Indisponível"}</span>
                  </div>
                  {/* Instagram */}
                  {contactDetails?.instagram && (
                    <div className="flex items-center gap-2 text-xs">
                      <Instagram className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{contactDetails.instagram}</span>
                    </div>
                  )}
                  {/* CPF */}
                  {contactDetails?.cpf && (
                    <div className="flex items-center gap-2 text-xs">
                      <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{contactDetails.cpf}</span>
                    </div>
                  )}
                  {/* Birthday */}
                  {contactDetails?.birthday && (
                    <div className="flex items-center gap-2 text-xs">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{contactDetails.birthday}</span>
                    </div>
                  )}
                  {/* Location */}
                  {(contactDetails?.city || contactDetails?.state) && (
                    <div className="flex items-center gap-2 text-xs">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>
                        {[contactDetails.city, BRAZIL_STATES.find((s) => s.uf === contactDetails.state)?.name || contactDetails.state].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  )}
                  {/* Lifecycle */}
                  {contactDetails?.lifecycle_stage && (
                    <div className="flex items-center gap-2 text-xs">
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{lifecycleStages.find((s) => s.value === contactDetails.lifecycle_stage)?.label || contactDetails.lifecycle_stage}</span>
                    </div>
                  )}
                  {/* Source */}
                  {contactDetails?.source && (
                    <div className="flex items-center gap-2 text-xs">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{origins.find((o) => o.value === contactDetails.source)?.label || contactDetails.source}</span>
                    </div>
                  )}
                  {/* Notes */}
                  {contactDetails?.notes && (
                    <div className="flex items-center gap-2 text-xs">
                      <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">{contactDetails.notes}</span>
                    </div>
                  )}
                  {/* Tags */}
                  <div className="flex items-start gap-2 text-xs">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <TagSelector tags={contactDetails?.tags || []} onChange={() => {}} readOnly />
                  </div>
                </div>
              )}

              {/* Deals section */}
              <Separator />
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium flex items-center gap-1.5">
                    <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                    Negociações ({contactDeals.length})
                  </p>
                  {contactDetails && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1" onClick={() => setShowNewDeal(true)}>
                      + Nova Venda
                    </Button>
                  )}
                </div>
                {contactDeals.length > 0 ? (
                  <div className="space-y-1.5">
                    {contactDeals.slice(0, 5).map((deal) => {
                      const stage = stages.find((s) => s.id === deal.pipeline_stage_id || s.name === deal.stage);
                      return (
                        <div key={deal.id} className="rounded-md border border-border p-2 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-[11px] font-medium truncate">{deal.title}</p>
                            {deal.value != null && deal.value > 0 && (
                              <span className="text-[10px] font-semibold tabular-nums text-green-700 dark:text-green-400 flex-shrink-0">
                                {deal.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              </span>
                            )}
                          </div>
                          {stage && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5"
                              style={{ backgroundColor: `${stage.color}20`, color: stage.color || undefined }}>
                              {stage.name}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Nenhuma negociação</p>
                )}
              </div>

              {/* Shared media */}
              {sharedMedia.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-2 text-xs font-medium flex items-center gap-1.5">
                      <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      Mídia compartilhada ({sharedMedia.length})
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {sharedMedia.slice(0, 9).map((m) => (
                        <a
                          key={m.id}
                          href={m.media_url || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="aspect-square rounded-md overflow-hidden bg-muted hover:opacity-80 transition-opacity"
                        >
                          {m.media_type === "video" ? (
                            <div className="h-full w-full flex items-center justify-center bg-muted">
                              <Video className="h-5 w-5 text-muted-foreground" />
                            </div>
                          ) : (
                            <img
                              src={m.media_thumbnail || m.media_url || ""}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          )}
                        </a>
                      ))}
                    </div>
                    {sharedMedia.length > 9 && (
                      <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
                        +{sharedMedia.length - 9} mais
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Shared documents */}
              {sharedDocs.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-2 text-xs font-medium flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      Documentos ({sharedDocs.length})
                    </p>
                    <div className="space-y-1">
                      {sharedDocs.slice(0, 5).map((m) => {
                        const meta = m.metadata as Record<string, any> | null;
                        const fileName = meta?.fileName || m.content || "Documento";
                        return (
                          <a
                            key={m.id}
                            href={m.media_url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-md p-1.5 hover:bg-muted transition-colors"
                          >
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-xs truncate flex-1">{fileName}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          <Separator />
          <div>
            <p className="mb-1 text-xs font-medium">Conexão</p>
            <p className="text-xs text-muted-foreground">{instanceDisplayName || instanceName || "—"}</p>
          </div>
        </div>
      </ScrollArea>

      {/* New Deal Dialog */}
      <NewDealDialog
        open={showNewDeal}
        onOpenChange={setShowNewDeal}
        stages={stages}
        defaultContactId={contactDetails?.id}
      />
    </div>
  );
}
