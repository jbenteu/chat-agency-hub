import { useState, useMemo, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Smile, Search } from "lucide-react";

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Frequentes",
    emojis: ["😂", "❤️", "👍", "🔥", "😍", "🙏", "😊", "😭", "🥰", "😘", "💕", "🤣", "😁", "👏", "🎉", "💯"],
  },
  {
    label: "Rostos",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "🥹", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇",
      "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝",
      "🤗", "🤭", "🫢", "🫣", "🤫", "🤔", "🫡", "🤐", "🤨", "😐", "😑", "😶",
      "🫥", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴",
      "😷", "🤒", "🤕", "🤢", "🤮", "🥴", "😵", "🤯", "🥱", "😤", "😡", "🤬",
      "😈", "👿", "💀", "☠️", "💩", "🤡", "👹", "👺", "👻", "👽", "🤖",
    ],
  },
  {
    label: "Gestos",
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "🫱", "🫲", "🫳", "🫴", "👌", "🤌", "🤏",
      "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️",
      "🫵", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲",
      "🤝", "🙏", "✍️", "💪", "🦾",
    ],
  },
  {
    label: "Amor",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹",
      "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️", "💋", "💌",
    ],
  },
  {
    label: "Objetos",
    emojis: [
      "🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "⭐", "🌟", "💫", "✨", "🔥", "💥",
      "💯", "🎯", "💰", "💵", "📱", "💻", "📸", "🎵", "🎶", "🔔", "📌",
      "✅", "❌", "⚠️", "❓", "❗", "💡", "📝", "📎", "🔗", "⏰",
    ],
  },
  {
    label: "Comida",
    emojis: [
      "🍕", "🍔", "🍟", "🌭", "🍿", "🧀", "🥚", "🍳", "🥞", "🧇", "🥓",
      "☕", "🍵", "🧃", "🍺", "🍷", "🥂", "🍰", "🎂", "🍫", "🍬", "🍭",
    ],
  },
  {
    label: "Animais",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁",
      "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦅", "🦋", "🐛", "🐝",
    ],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(0);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return EMOJI_CATEGORIES;
    // Simple text filter isn't great for emojis — just flatten and show matches
    const q = search.toLowerCase();
    const categoryLabels: Record<string, string[]> = {
      "frequentes": ["popular", "comum", "mais usado"],
      "rostos": ["rosto", "cara", "sorriso", "rindo", "triste", "feliz", "chorando", "bravo"],
      "gestos": ["mão", "dedo", "polegar", "palma", "punho", "aplauso"],
      "amor": ["coração", "amor", "paixão", "carinho"],
      "objetos": ["festa", "fogo", "estrela", "dinheiro", "celular", "telefone"],
      "comida": ["comida", "pizza", "hambúrguer", "café", "bolo", "cerveja"],
      "animais": ["animal", "cachorro", "gato", "rato", "urso", "pássaro"],
    };

    return EMOJI_CATEGORIES.filter((cat) => {
      const catKey = cat.label.toLowerCase();
      const aliases = categoryLabels[catKey] || [];
      return catKey.includes(q) || aliases.some((a) => a.includes(q));
    });
  }, [search]);

  const handleSelect = useCallback((emoji: string) => {
    onSelect(emoji);
    setOpen(false);
    setSearch("");
  }, [onSelect]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title="Emoji"
        >
          <Smile className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" side="top" align="start" sideOffset={8}>
        <div className="flex flex-col h-80">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar emoji…"
                className="h-7 pl-7 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Category tabs */}
          {!search && (
            <div className="flex border-b border-border px-1">
              {EMOJI_CATEGORIES.map((cat, idx) => (
                <button
                  key={cat.label}
                  onClick={() => setActiveCategory(idx)}
                  className={`flex-1 py-1.5 text-[10px] font-medium transition-colors truncate px-0.5 ${
                    activeCategory === idx
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat.emojis[0]}
                </button>
              ))}
            </div>
          )}

          {/* Emoji grid */}
          <div className="flex-1 overflow-y-auto p-2">
            {(search ? filteredCategories : [EMOJI_CATEGORIES[activeCategory]]).map((cat) => (
              <div key={cat.label}>
                <p className="text-[10px] font-medium text-muted-foreground mb-1 px-0.5">{cat.label}</p>
                <div className="grid grid-cols-8 gap-0.5 mb-2">
                  {cat.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleSelect(emoji)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-accent transition-colors active:scale-95"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
