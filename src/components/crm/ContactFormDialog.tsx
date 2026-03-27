import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, UserCheck } from "lucide-react";
import { useContacts, getTenantId, type Contact } from "@/hooks/use-contacts";
import { BRAZIL_STATES, BRAZIL_CITIES } from "@/data/brazil-locations";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

async function checkDuplicate(phone: string, email: string): Promise<Contact | null> {
  if (!phone && !email) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any).from("contacts").select("*").limit(1);
  if (phone) q = q.eq("phone", phone);
  else if (email) q = q.eq("email", email);
  const { data } = await q;
  return (data && data.length > 0) ? data[0] as Contact : null;
}

export function ContactFormDialog({ open, onOpenChange }: Props) {
  const { createContact } = useContacts();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [duplicate, setDuplicate] = useState<Contact | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const cities = state ? BRAZIL_CITIES[state] || [] : [];

  const handlePhoneBlur = async () => {
    if (!phone.trim()) return;
    setCheckingDuplicate(true);
    const found = await checkDuplicate(phone, "");
    setDuplicate(found);
    setCheckingDuplicate(false);
  };

  const handleEmailBlur = async () => {
    if (!email.trim() || duplicate) return;
    setCheckingDuplicate(true);
    const found = await checkDuplicate("", email);
    setDuplicate(found);
    setCheckingDuplicate(false);
  };

  const handleReset = () => {
    setName(""); setPhone(""); setEmail(""); setCompany("");
    setState(""); setCity(""); setDuplicate(null);
  };

  const handleClose = (open: boolean) => {
    if (!open) handleReset();
    onOpenChange(open);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const tenantId = await getTenantId();
      await createContact.mutateAsync({
        name,
        phone: phone || null,
        email: email || null,
        company: company || null,
        state: state || null,
        city: city || null,
        origin: "manual",
        source: "manual",
        tenant_id: tenantId,
      });
      toast.success("Contato criado com sucesso");
      handleClose(false);
    } catch {
      toast.error("Erro ao criar contato");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo contato</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs">Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required className="h-8 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setDuplicate(null); }}
                onBlur={handlePhoneBlur}
                placeholder="+55 11..."
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input
                value={email}
                onChange={(e) => { setEmail(e.target.value); setDuplicate(null); }}
                onBlur={handleEmailBlur}
                type="email"
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Duplicate warning */}
          {checkingDuplicate && (
            <p className="text-xs text-muted-foreground">Verificando duplicatas...</p>
          )}
          {duplicate && !checkingDuplicate && (
            <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm">
                <strong>Possível duplicata encontrada:</strong> já existe um contato com este telefone/e-mail —{" "}
                <span className="font-medium">{duplicate.name}</span>.
                <br />
                <button
                  type="button"
                  className="text-amber-700 dark:text-amber-400 underline text-xs mt-1"
                  onClick={() => { toast.info(`Abra o contato "${duplicate?.name}" para ver os detalhes`); }}
                >
                  <UserCheck className="inline h-3 w-3 mr-1" />
                  Vincular ao contato existente
                </button>
                {" · "}
                <button
                  type="button"
                  className="text-muted-foreground underline text-xs mt-1"
                  onClick={() => setDuplicate(null)}
                >
                  Criar mesmo assim
                </button>
              </AlertDescription>
            </Alert>
          )}

          <div>
            <Label className="text-xs">Empresa</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} className="h-8 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={state} onValueChange={(v) => { setState(v); setCity(""); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  {BRAZIL_STATES.map((s) => (
                    <SelectItem key={s.uf} value={s.uf}>{s.uf} — {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Cidade</Label>
              <Select value={city} onValueChange={setCity} disabled={!state}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Cidade" /></SelectTrigger>
                <SelectContent>
                  {cities.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={createContact.isPending}>
            {createContact.isPending ? "Criando..." : "Criar contato"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
