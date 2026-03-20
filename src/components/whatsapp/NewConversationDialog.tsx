import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { maskPhoneInput, COUNTRY_CODES } from "@/data/country-codes";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import type { EvolutionInstance } from "@/hooks/use-evolution-api";

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instances: EvolutionInstance[];
  selectedInstanceId: string;
  onSend: (instanceName: string, phone: string, message: string) => Promise<void>;
}

export function NewConversationDialog({
  open, onOpenChange, instances, selectedInstanceId, onSend,
}: NewConversationDialogProps) {
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+55");
  const [countryOpen, setCountryOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [instanceId, setInstanceId] = useState(selectedInstanceId);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const digits = phone.replace(/\D/g, "");
    if (!digits || !message.trim()) return;

    const fullPhone = `${countryCode.replace("+", "")}${digits}`;
    const inst = instances.find((i) => i.id === instanceId);
    if (!inst) return;

    setSending(true);
    try {
      await onSend(inst.instance_name, fullPhone, message.trim());
      setPhone("");
      setMessage("");
      onOpenChange(false);
    } catch {
      // toast handled by parent
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Nova conversa
          </DialogTitle>
          <DialogDescription>
            Envie uma mensagem para um novo número de telefone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Instance selector */}
          {instances.length > 1 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Conexão</label>
              <Select value={instanceId} onValueChange={setInstanceId}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {instances.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.display_name || i.phone_number || i.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Phone input */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Telefone</label>
            <div className="flex gap-1.5 mt-1">
              <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 h-8 px-2 rounded-md border border-input bg-background text-xs shrink-0 hover:bg-accent transition-colors">
                    <span>{COUNTRY_CODES.find((c) => c.dial === countryCode)?.flag || "🇧🇷"}</span>
                    <span className="text-[11px] text-muted-foreground">{countryCode}</span>
                    <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="start">
                  <div className="max-h-48 overflow-y-auto">
                    {COUNTRY_CODES.map((c) => (
                      <button
                        key={c.code}
                        onClick={() => { setCountryCode(c.dial); setCountryOpen(false); }}
                        className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                      >
                        <span>{c.flag}</span>
                        <span className="flex-1 text-left">{c.name}</span>
                        <span className="text-muted-foreground">{c.dial}</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Input
                placeholder="(XX) XXXXX-XXXX"
                className="h-8 text-xs flex-1"
                value={phone}
                onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
              />
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Mensagem</label>
            <Input
              placeholder="Olá! Como posso ajudar?"
              className="h-8 text-xs mt-1"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
          </div>

          <Button className="w-full" onClick={handleSend} disabled={sending || !phone.replace(/\D/g, "") || !message.trim()}>
            {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            {sending ? "Enviando…" : "Enviar mensagem"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
