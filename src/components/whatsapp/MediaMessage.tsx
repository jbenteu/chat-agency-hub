import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Image as ImageIcon, FileText, Download, Play, Volume2 } from "lucide-react";

// Module-level cache for downloaded media
const mediaCache = new Map<string, string>();

interface MediaMessageProps {
  messageId: string | null;
  mediaUrl: string | null;
  mediaType: string;
  content: string | null;
  instanceName: string;
  remoteJid: string;
  isOutbound: boolean;
}

/**
 * Detects if a URL is a WhatsApp CDN URL (which expires quickly)
 */
function isExpirableUrl(url: string): boolean {
  return url.includes("mmg.whatsapp.net") || url.includes("media.whatsapp") || url.includes("enc.") ;
}

export function MediaMessage({ messageId, mediaUrl, mediaType, content, instanceName, remoteJid, isOutbound }: MediaMessageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // If media_url is a base64 or a non-expirable URL, use directly
    if (mediaUrl && !isExpirableUrl(mediaUrl)) {
      setResolvedUrl(mediaUrl);
      return;
    }

    // If it's base64 data, use directly
    if (mediaUrl && mediaUrl.startsWith("data:")) {
      setResolvedUrl(mediaUrl);
      return;
    }

    // Check cache
    const cacheKey = messageId || mediaUrl || "";
    if (mediaCache.has(cacheKey)) {
      setResolvedUrl(mediaCache.get(cacheKey)!);
      return;
    }

    // Need to fetch via Evolution API
    if (!messageId || !instanceName || fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchMedia = async () => {
      setLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;

        const { data, error: fnError } = await supabase.functions.invoke("evolution-api", {
          body: { action: "get_media", instanceName, messageId, remoteJid },
          headers: { Authorization: `Bearer ${token}` },
        });

        if (fnError || data?.error) {
          setError(true);
          return;
        }

        const url = data?.mediaData || data?.mediaUrl || null;
        if (url) {
          mediaCache.set(cacheKey, url);
          setResolvedUrl(url);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchMedia();
  }, [messageId, mediaUrl, instanceName, remoteJid]);

  if (loading) {
    return (
      <div className="mb-1 flex items-center justify-center gap-2 rounded-lg bg-background/10 p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Carregando mídia…</span>
      </div>
    );
  }

  if (error && !resolvedUrl) {
    if (mediaType === "image") {
      return (
        <div className="mb-1 flex items-center gap-2 rounded-lg bg-background/10 p-3">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Imagem indisponível</span>
        </div>
      );
    }
    if (mediaType === "audio") {
      return (
        <div className="mb-1 flex items-center gap-2 rounded-lg bg-background/10 p-3">
          <Volume2 className="h-5 w-5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Áudio indisponível</span>
        </div>
      );
    }
    return (
      <div className="mb-1 flex items-center gap-2 rounded-lg bg-background/10 p-3">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Mídia indisponível</span>
      </div>
    );
  }

  if (!resolvedUrl) return null;

  if (mediaType === "image") {
    return (
      <a href={resolvedUrl} target="_blank" rel="noopener noreferrer" className="block mb-1">
        <img
          src={resolvedUrl}
          alt="Imagem"
          className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
          loading="lazy"
          onError={() => setError(true)}
        />
      </a>
    );
  }

  if (mediaType === "sticker") {
    return (
      <img
        src={resolvedUrl}
        alt="Sticker"
        className="mb-1 max-h-36 max-w-full rounded-lg"
        loading="lazy"
        onError={() => setError(true)}
      />
    );
  }

  if (mediaType === "video") {
    return (
      <video controls className="mb-1 max-w-full rounded-lg" preload="metadata">
        <source src={resolvedUrl} />
      </video>
    );
  }

  if (mediaType === "audio") {
    return (
      <audio controls className="mb-1 w-full min-w-[200px]" preload="metadata">
        <source src={resolvedUrl} />
      </audio>
    );
  }

  if (mediaType === "document") {
    return (
      <a href={resolvedUrl} target="_blank" rel="noopener noreferrer"
        className="mb-1 flex items-center gap-2 rounded bg-background/20 p-2 text-xs hover:bg-background/30 transition-colors cursor-pointer">
        <FileText className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{content || "Documento"}</span>
        <Download className="h-3.5 w-3.5 shrink-0" />
      </a>
    );
  }

  return null;
}
