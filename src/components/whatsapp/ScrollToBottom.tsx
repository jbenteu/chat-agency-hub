import { ChevronDown } from "lucide-react";

interface ScrollToBottomProps {
  visible: boolean;
  unreadCount?: number;
  onClick: () => void;
}

export function ScrollToBottom({ visible, unreadCount, onClick }: ScrollToBottomProps) {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="absolute bottom-20 right-6 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-lg transition-all hover:bg-accent active:scale-95"
    >
      <ChevronDown className="h-5 w-5 text-muted-foreground" />
      {unreadCount && unreadCount > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
