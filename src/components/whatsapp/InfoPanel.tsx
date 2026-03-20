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
import {
  X, Edit2, Check, Loader2, MessageCircle, Phone, Mail, Building2, MapPin,
  Clock, Tag, Link2, Copy, Users, ShieldCheck, Crown, UserMinus, ChevronUp,
  ChevronDown, Image as ImageIcon, FileText, Video,
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
}

interface InfoPanelProps {
  conversation: Conversation;
  profilePicUrl?: string;
  profilePics: Record<string, string>;
  groupInfo?: GroupInfo;
  instanceName: string;
  messages: WhatsAppMessage[];
  onClose: () => void;
}

export function InfoPanel({
  conversation, profilePicUrl, profilePics, groupInfo, instanceName, messages, onClose,
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

  // Load contact details
  useEffect(() => {
    if (isGroup || !conversation.contact_id) return;
    const load = async () => {
      try {
        const data = await getContact(conversation.contact_id!);
        if (data?.contact) setContactDetails(data.contact);
      } catch {}
    };
    load();
  }, [conversation.contact_id, isGroup, getContact]);

  // Shared media
  const sharedMedia = messages.filter(
    (m) => m.media_type && ["image", "video", "sticker"].includes(m.media_type) && m.media_url
  );
  const sharedDocs = messages.filter((m) => m.media_type === "document" && m.media_url);

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((p) => p[0]).join("").substring(0, 2).toUpperCase();
  };

  const formatFullDate = (d: string) => {
    try { return format(new Date(d), "dd/MM/yyyy 'às' HH:mm"); } catch { return ""; }
  };

  const startEditing = useCallback(() => {
    if (!contactDetails) return;
    setForm({
      name: contactDetails.name || "",
      email: contactDetails.email || "",
      phone: formatPhoneEdit(contactDetails.phone),
      company: contactDetails.company || "",
      notes: contactDetails.notes || "",
      address: contactDetails.custom_fields?.address || "",
      state: contactDetails.custom_fields?.state || "",
      city: contactDetails.custom_fields?.city || "",
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
      await updateContact(contactDetails.id, {
        name: form.name,
        email: form.email || null,
        phone: fullPhone,
        company: form.company || null,
        notes: form.notes || null,
        tags: form.tags ? form.tags.split(",").filter(Boolean) : [],
        custom_fields: { address: form.address, state: form.state, city: form.city },
      });
      setContactDetails((prev) => prev ? {
        ...prev,
        name: form.name, email: form.email || null, phone: fullPhone,
        company: form.company || null, notes: form.notes || null,
        tags: form.tags ? form.tags.split(",").filter(Boolean) : [],
        custom_fields: { address: form.address, state: form.state, city: form.city },
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
              {/* Group description */}
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

              {/* Invite link */}
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

              {/* Participants */}
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
                    <label className="text-[11px] font-medium text-muted-foreground">Email</label>
                    <Input className="h-7 text-xs mt-0.5" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
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
                    <label className="text-[11px] font-medium text-muted-foreground">Empresa</label>
                    <Input className="h-7 text-xs mt-0.5" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Endereço</label>
                    <Input className="h-7 text-xs mt-0.5" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Estado</label>
                    <Select value={form.state} onValueChange={(v) => setForm((f) => ({ ...f, state: v, city: "" }))}>
                      <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {BRAZIL_STATES.map((s) => <SelectItem key={s.uf} value={s.uf}>{s.uf} - {s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Cidade</label>
                    <Select value={form.city} onValueChange={(v) => setForm((f) => ({ ...f, city: v }))} disabled={!form.state}>
                      <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue placeholder={form.state ? "Selecione" : "Selecione o estado"} /></SelectTrigger>
                      <SelectContent>
                        {(BRAZIL_CITIES[form.state] || []).map((city) => <SelectItem key={city} value={city}>{city}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
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
                  <div className="flex items-center gap-2 text-xs">
                    <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{contactDetails?.notes || "Indisponível"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{formatPhoneWhatsApp(conversation.contact_phone)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{contactDetails?.email || "Indisponível"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{contactDetails?.company || "Indisponível"}</span>
                  </div>
                  {(contactDetails?.custom_fields?.city || contactDetails?.custom_fields?.state) && (
                    <div className="flex items-center gap-2 text-xs">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>
                        {[contactDetails.custom_fields.city, BRAZIL_STATES.find((s) => s.uf === contactDetails.custom_fields.state)?.name || contactDetails.custom_fields.state].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  )}
                  <div className="flex items-start gap-2 text-xs">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <TagSelector tags={contactDetails?.tags || []} onChange={() => {}} readOnly />
                  </div>
                </div>
              )}

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
            <p className="text-xs text-muted-foreground">{instanceName || "—"}</p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
