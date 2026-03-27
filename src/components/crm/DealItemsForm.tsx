import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { DealItem } from "@/hooks/use-deals";

interface Props {
  dealId: string;
  tenantId: string;
  items: DealItem[];
}

export function DealItemsForm({ dealId, tenantId, items }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newPrice, setNewPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const totalValue = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  const updateDealValue = async (newTotal: number) => {
    await supabase.from("deals").update({ value: newTotal } as never).eq("id", dealId);
    queryClient.invalidateQueries({ queryKey: ["deals"] });
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newPrice) return;
    setSaving(true);
    try {
      const unitPrice = parseFloat(newPrice) || 0;
      const qty = parseInt(newQty) || 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("deal_items").insert({
        deal_id: dealId,
        tenant_id: tenantId,
        product_name: newName.trim(),
        quantity: qty,
        unit_price: unitPrice,
      });
      if (error) throw error;
      setNewName("");
      setNewQty("1");
      setNewPrice("");
      // Update deal value
      await updateDealValue(totalValue + qty * unitPrice);
    } catch {
      toast({ title: "Erro ao adicionar produto", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      const item = items.find((i) => i.id === itemId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("deal_items").delete().eq("id", itemId);
      if (error) throw error;
      const newTotal = totalValue - (item ? item.quantity * item.unit_price : 0);
      await updateDealValue(Math.max(0, newTotal));
    } catch {
      toast({ title: "Erro ao remover produto", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => {
            const subtotal = item.quantity * item.unit_price;
            return (
              <div key={item.id} className="flex items-center gap-2 text-sm bg-muted/40 rounded px-2 py-1.5">
                <span className="flex-1 font-medium truncate">{item.product_name}</span>
                <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                  {item.quantity}x {item.unit_price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
                <span className="text-xs tabular-nums font-medium whitespace-nowrap">
                  = {subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          <p className="text-sm text-right font-semibold tabular-nums">
            Total: {totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </p>
        </div>
      )}

      <div className="grid grid-cols-[1fr_60px_90px_auto] gap-1.5 items-end">
        <div>
          <Label className="text-xs">Produto</Label>
          <Input
            placeholder="Nome do produto"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Qtd</Label>
          <Input
            type="number"
            min="1"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Preço unit.</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0,00"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <Button
          size="sm"
          className="h-8"
          onClick={handleAdd}
          disabled={saving || !newName.trim() || !newPrice}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
