import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useContacts, getTenantId } from "@/hooks/use-contacts";
import { BRAZIL_STATES, BRAZIL_CITIES } from "@/data/brazil-locations";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactFormDialog({ open, onOpenChange }: Props) {
  const { createContact } = useContacts();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");

  const cities = state ? BRAZIL_CITIES[state] || [] : [];

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
        tenant_id: tenantId,
      });
      toast({ title: "Contato criado com sucesso" });
      onOpenChange(false);
      setName(""); setPhone(""); setEmail(""); setCompany(""); setState(""); setCity("");
    } catch {
      toast({ title: "Erro ao criar contato", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo contato</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs">Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55..." />
            </div>
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Empresa</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={state} onValueChange={(v) => { setState(v); setCity(""); }}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  {BRAZIL_STATES.map((s) => (
                    <SelectItem key={s.uf} value={s.uf}>{s.uf} - {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Cidade</Label>
              <Select value={city} onValueChange={setCity} disabled={!state}>
                <SelectTrigger><SelectValue placeholder="Cidade" /></SelectTrigger>
                <SelectContent>
                  {cities.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={createContact.isPending}>
            Criar contato
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
