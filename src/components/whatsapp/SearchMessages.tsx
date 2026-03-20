import { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import type { WhatsAppMessage } from "@/hooks/use-evolution-api";

interface SearchMessagesProps {
  messages: WhatsAppMessage[];
  visible: boolean;
  onClose: () => void;
}

export function SearchMessages({ messages, visible, onClose }: SearchMessagesProps) {
  const [query, setQuery] = useState("");
  const [matchIds, setMatchIds] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setMatchIds([]);
      setCurrentIdx(0);
      // Remove all highlights
      document.querySelectorAll("[data-search-highlight]").forEach((el) => {
        el.removeAttribute("data-search-highlight");
        el.classList.remove("ring-2", "ring-primary/50", "bg-yellow-100/50", "dark:bg-yellow-900/30");
      });
    }
  }, [visible]);

  const doSearch = useCallback((q: string) => {
    // Remove old highlights
    document.querySelectorAll("[data-search-highlight]").forEach((el) => {
      el.removeAttribute("data-search-highlight");
      el.classList.remove("ring-2", "ring-primary/50", "bg-yellow-100/50", "dark:bg-yellow-900/30");
    });

    if (!q.trim()) {
      setMatchIds([]);
      setCurrentIdx(0);
      return;
    }

    const lower = q.toLowerCase();
    const matches: string[] = [];

    for (const msg of messages) {
      if (!msg.content) continue;
      if (msg.content.toLowerCase().includes(lower)) {
        const id = msg.message_id || msg.id;
        matches.push(id);
        // Add highlight
        const el = document.querySelector(`[data-message-id="${id}"]`);
        if (el) {
          el.setAttribute("data-search-highlight", "true");
          el.classList.add("bg-yellow-100/50", "dark:bg-yellow-900/30");
        }
      }
    }

    setMatchIds(matches);
    setCurrentIdx(0);

    // Scroll to first match
    if (matches.length > 0) {
      scrollToMatch(matches[0]);
    }
  }, [messages]);

  const scrollToMatch = (id: string) => {
    // Remove active ring from all
    document.querySelectorAll("[data-search-highlight]").forEach((el) => {
      el.classList.remove("ring-2", "ring-primary/50");
    });

    const el = document.querySelector(`[data-message-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary/50");
    }
  };

  const goNext = () => {
    if (matchIds.length === 0) return;
    const next = (currentIdx + 1) % matchIds.length;
    setCurrentIdx(next);
    scrollToMatch(matchIds[next]);
  };

  const goPrev = () => {
    if (matchIds.length === 0) return;
    const prev = (currentIdx - 1 + matchIds.length) % matchIds.length;
    setCurrentIdx(prev);
    scrollToMatch(matchIds[prev]);
  };

  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-2 animate-fade-in">
      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Input
        ref={inputRef}
        placeholder="Buscar na conversa…"
        className="h-7 flex-1 text-xs"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          doSearch(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.shiftKey ? goPrev() : goNext();
          }
          if (e.key === "Escape") onClose();
        }}
      />
      {matchIds.length > 0 && (
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {currentIdx + 1}/{matchIds.length}
        </span>
      )}
      {query && matchIds.length === 0 && (
        <span className="text-[10px] text-muted-foreground shrink-0">0 resultados</span>
      )}
      <div className="flex items-center shrink-0">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={goPrev} disabled={matchIds.length === 0}>
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={goNext} disabled={matchIds.length === 0}>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
