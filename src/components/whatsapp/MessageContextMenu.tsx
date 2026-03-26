import { useState, useMemo } from "react";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Reply, Copy, Trash2, Plus, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MessageContextMenuProps {
  children: React.ReactNode;
  content: string | null;
  isOutbound: boolean;
  messageId: string | null;
  senderName: string;
  onReply: () => void;
  onReact?: (emoji: string) => void;
  onDelete?: () => void;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function MessageContextMenu({
  children, content, isOutbound, onReply, onReact, onDelete,
}: MessageContextMenuProps) {
  const { toast } = useToast();
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      toast({ title: "Copiado!" });
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    onReact?.(emoji);
    setEmojiPickerOpen(false);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {/* Quick reactions + more button */}
        {onReact && (
          <>
            <div className="flex items-center justify-around px-2 py-1.5">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onReact(emoji)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
              <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-all hover:scale-110 hover:bg-accent active:scale-95"
                    title="Mais emojis"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" side="right" align="start" sideOffset={8}>
                  <EmojiPickerGrid onSelect={handleEmojiSelect} />
                </PopoverContent>
              </Popover>
            </div>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={onReply}>
          <Reply className="mr-2 h-4 w-4" />
          Responder
        </ContextMenuItem>
        {content && (
          <ContextMenuItem onClick={handleCopy}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar texto
          </ContextMenuItem>
        )}
        {isOutbound && onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Apagar mensagem
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* Inline emoji grid (not using the Popover-based EmojiPicker component to avoid nested popovers) */
import { useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  { label: "Frequentes", emojis: ["😂", "❤️", "👍", "🔥", "😍", "🙏", "😊", "😭", "🥰", "😘", "💕", "🤣", "😁", "👏", "🎉", "💯"] },
  { label: "Rostos", emojis: ["😀","😃","😄","😁","😆","🥹","😅","🤣","😂","🙂","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤗","🤭","🫢","🫣","🤫","🤔","🫡","🤐","🤨","😐","😑","😶","🫥","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥴","😵","🤯","🥱","😤","😡","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","🤖"] },
  { label: "Gestos", emojis: ["👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","🫵","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💪","🦾"] },
  { label: "Amor", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","💕","💞","💓","💗","💖","💘","💝","💟","♥️","💋","💌"] },
  { label: "Objetos", emojis: ["🎉","🎊","🎈","🎁","🏆","🥇","⭐","🌟","💫","✨","🔥","💥","💯","🎯","💰","💵","📱","💻","📸","🎵","🎶","🔔","📌","✅","❌","⚠️","❓","❗","💡","📝","📎","🔗","⏰"] },
  { label: "Comida", emojis: ["🍕","🍔","🍟","🌭","🍿","🧀","🥚","🍳","🥞","🧇","🥓","☕","🍵","🧃","🍺","🍷","🥂","🍰","🎂","🍫","🍬","🍭"] },
  { label: "Animais", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦅","🦋","🐛","🐝"] },
];

function EmojiPickerGrid({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(0);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return EMOJI_CATEGORIES;
    const q = search.toLowerCase();
    const categoryLabels: Record<string, string[]> = {
      frequentes: ["popular", "comum"],
      rostos: ["rosto", "cara", "sorriso", "rindo", "triste", "feliz"],
      gestos: ["mão", "dedo", "polegar"],
      amor: ["coração", "amor"],
      objetos: ["festa", "fogo", "estrela"],
      comida: ["comida", "pizza", "café"],
      animais: ["animal", "cachorro", "gato"],
    };
    return EMOJI_CATEGORIES.filter((cat) => {
      const catKey = cat.label.toLowerCase();
      const aliases = categoryLabels[catKey] || [];
      return catKey.includes(q) || aliases.some((a) => a.includes(q));
    });
  }, [search]);

  return (
    <div className="flex flex-col h-72">
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar emoji…" className="h-7 pl-7 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>
      </div>
      {!search && (
        <div className="flex border-b border-border px-1">
          {EMOJI_CATEGORIES.map((cat, idx) => (
            <button key={cat.label} onClick={() => setActiveCategory(idx)}
              className={`flex-1 py-1.5 text-[10px] font-medium transition-colors truncate px-0.5 ${activeCategory === idx ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
            >{cat.emojis[0]}</button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2">
        {(search ? filteredCategories : [EMOJI_CATEGORIES[activeCategory]]).map((cat) => (
          <div key={cat.label}>
            <p className="text-[10px] font-medium text-muted-foreground mb-1 px-0.5">{cat.label}</p>
            <div className="grid grid-cols-8 gap-0.5 mb-2">
              {cat.emojis.map((emoji) => (
                <button key={emoji} onClick={() => onSelect(emoji)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-accent transition-colors active:scale-95"
                >{emoji}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
