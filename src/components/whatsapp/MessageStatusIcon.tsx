import { Clock } from "lucide-react";

interface MessageStatusIconProps {
  status: string | null;
  isOptimistic?: boolean;
}

export function MessageStatusIcon({ status, isOptimistic }: MessageStatusIconProps) {
  if (isOptimistic || status === "pending") {
    return <Clock className="h-3 w-3" />;
  }

  if (status === "read" || status === "played") {
    return (
      <svg width="16" height="11" viewBox="0 0 16 11" fill="none" className="inline">
        <path d="M11.07 0.73a.5.5 0 01.76.65l-.06.07L6.43 7.32a.5.5 0 01-.63.06l-.07-.06-2.1-2.1a.5.5 0 01.63-.76l.07.06L6.08 6.26l5-5.53z" fill="#53BDEB" />
        <path d="M14.07 0.73a.5.5 0 01.76.65l-.06.07L9.43 7.32a.5.5 0 01-.63.06l-.07-.06-.53-.53.7-.72.18.18 4.99-5.52z" fill="#53BDEB" />
      </svg>
    );
  }

  if (status === "delivered") {
    return (
      <svg width="16" height="11" viewBox="0 0 16 11" fill="none" className="inline">
        <path d="M11.07 0.73a.5.5 0 01.76.65l-.06.07L6.43 7.32a.5.5 0 01-.63.06l-.07-.06-2.1-2.1a.5.5 0 01.63-.76l.07.06L6.08 6.26l5-5.53z" fill="#8696A0" />
        <path d="M14.07 0.73a.5.5 0 01.76.65l-.06.07L9.43 7.32a.5.5 0 01-.63.06l-.07-.06-.53-.53.7-.72.18.18 4.99-5.52z" fill="#8696A0" />
      </svg>
    );
  }

  // "sent" or "server"
  return (
    <svg width="12" height="11" viewBox="0 0 12 11" fill="none" className="inline">
      <path d="M9.07 0.73a.5.5 0 01.76.65l-.06.07L4.43 7.32a.5.5 0 01-.63.06l-.07-.06-2.1-2.1a.5.5 0 01.63-.76l.07.06L4.08 6.26l5-5.53z" fill="#8696A0" />
    </svg>
  );
}
