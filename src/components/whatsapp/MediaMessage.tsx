import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Image as ImageIcon, ImageOff, FileText, Download, Play, Pause, Volume2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./ImageLightbox";

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
  mediaThumbnail?: string | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  metadataMimeType?: string | null;
}

function isExpirableUrl(url: string): boolean {
  // URLs do MinIO sem assinatura AWS são permanentes — usar diretamente
  if (!url.includes("X-Amz-")) return false;
  return (
    url.includes("mmg.whatsapp.net") ||
    url.includes("media.whatsapp.net") ||
    url.includes(".enc?")
  );
}

/** Transform internal Docker MinIO URLs to public-facing URLs */
function fixMinioUrl(url: string): string {
  return url
    .replace(/^http:\/\/minio:9000\//, "https://chatwoot-evo-minio.fd6j1o.easypanel.host/")
    .replace(/^http:\/\/82\.25\.70\.124:9000\//, "https://chatwoot-evo-minio.fd6j1o.easypanel.host/");
}

// ── WhatsApp-style Audio Player ──
function AudioPlayer({ src, isOutbound, mimeType }: { src: string; isOutbound: boolean; mimeType?: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveform] = useState(() =>
    Array.from({ length: 28 }, () => 0.15 + Math.random() * 0.85)
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDuration(audio.duration || 0);
    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play().catch(() => {}); }
    setPlaying(!playing);
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const formatTime = (t: number) => {
    if (!t || !isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  };

  return (
    <div className="flex items-center gap-2 min-w-[220px] max-w-[280px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={togglePlay}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
          isOutbound
            ? "bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground"
            : "bg-primary/20 hover:bg-primary/30 text-primary"
        }`}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex flex-1 flex-col gap-1">
        {/* Waveform */}
        <div className="flex items-end gap-[2px] h-5 cursor-pointer" onClick={handleSeek}>
          {waveform.map((h, i) => {
            const barProgress = i / waveform.length;
            const isActive = barProgress <= progress;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-colors ${
                  isActive
                    ? isOutbound ? "bg-primary-foreground/80" : "bg-primary/80"
                    : isOutbound ? "bg-primary-foreground/25" : "bg-primary/25"
                }`}
                style={{ height: `${h * 100}%` }}
              />
            );
          })}
        </div>
        {/* Time */}
        <span className={`text-[10px] ${
          isOutbound ? "text-primary-foreground/60" : "text-muted-foreground"
        }`}>
          {playing || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

export function MediaMessage({ messageId, mediaUrl, mediaType, content, instanceName, remoteJid, isOutbound, mediaThumbnail, mediaWidth, mediaHeight, metadataMimeType }: MediaMessageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [triedDirectUrlFallback, setTriedDirectUrlFallback] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const fetchedRef = useRef(false);

  const tryRedownload = async () => {
    if (!messageId || !instanceName) return;
    setReloading(true);
    setError(false);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { setError(true); return; }

      const { data, error: fnError } = await supabase.functions.invoke("evolution-api", {
        body: { action: "get_media", instanceName, messageId, remoteJid },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (fnError || data?.error) { setError(true); return; }

      const url = data?.mediaData || data?.mediaUrl || null;
      if (url) {
        const cacheKey = messageId || mediaUrl || "";
        mediaCache.set(cacheKey, url);
        setResolvedUrl(url);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setReloading(false);
    }
  };

  useEffect(() => {
    fetchedRef.current = false;
    setError(false);
    setResolvedUrl(null);
    setTriedDirectUrlFallback(false);
    setThumbnailLoaded(false);

    const fallbackToDirectUrl = () => {
      if (!mediaUrl) return false;
      setResolvedUrl(mediaUrl);
      setTriedDirectUrlFallback(true);
      return true;
    };

    if (mediaUrl && mediaUrl.startsWith("data:")) {
      setResolvedUrl(mediaUrl);
      return;
    }

    if (mediaUrl && !isExpirableUrl(mediaUrl)) {
      setResolvedUrl(fixMinioUrl(mediaUrl));
      return;
    }

    const cacheKey = messageId || mediaUrl || "";
    if (mediaCache.has(cacheKey)) {
      setResolvedUrl(mediaCache.get(cacheKey)!);
      return;
    }

    if (!messageId || !instanceName) {
      fallbackToDirectUrl();
      return;
    }

    fetchedRef.current = true;

    const fetchMedia = async () => {
      setLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) {
          if (!fallbackToDirectUrl()) setError(true);
          return;
        }

        const { data, error: fnError } = await supabase.functions.invoke("evolution-api", {
          body: { action: "get_media", instanceName, messageId, remoteJid },
          headers: { Authorization: `Bearer ${token}` },
        });

        if (fnError || data?.error) {
          if (!fallbackToDirectUrl()) setError(true);
          return;
        }

        const url = data?.mediaData || data?.mediaUrl || null;
        if (url) {
          mediaCache.set(cacheKey, url);
          setResolvedUrl(url);
        } else if (!fallbackToDirectUrl()) {
          setError(true);
        }
      } catch {
        if (!fallbackToDirectUrl()) setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchMedia();
  }, [messageId, mediaUrl, instanceName, remoteJid]);

  const handleImageError = () => {
    if (mediaUrl && resolvedUrl !== mediaUrl && !triedDirectUrlFallback) {
      setResolvedUrl(mediaUrl);
      setTriedDirectUrlFallback(true);
      return;
    }
    setResolvedUrl(null);
    setError(true);
  };

  // Thumbnail source for placeholder
  const thumbSrc = mediaThumbnail
    ? (mediaThumbnail.startsWith("data:") ? mediaThumbnail : `data:image/jpeg;base64,${mediaThumbnail}`)
    : null;

  if (loading) {
    if (thumbSrc && (mediaType === "image" || mediaType === "video")) {
      return (
        <div className="relative mb-1">
          <img src={thumbSrc} alt="Carregando…" className="max-w-full rounded-lg opacity-60 blur-[2px]"
            style={mediaWidth && mediaHeight ? { aspectRatio: `${mediaWidth}/${mediaHeight}`, maxHeight: 300 } : undefined} />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white drop-shadow" />
          </div>
        </div>
      );
    }
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
        <div className="mb-1 flex flex-col items-center gap-2 rounded-lg bg-background/10 p-4">
          {thumbSrc ? (
            <img src={thumbSrc} alt="Preview" className="max-w-full rounded-lg opacity-40 blur-sm"
              style={{ maxHeight: 200 }} />
          ) : (
            <ImageOff className="h-8 w-8 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">Imagem expirada</span>
          <button
            onClick={tryRedownload}
            disabled={reloading}
            className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {reloading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Recarregar
          </button>
        </div>
      );
    }
    if (mediaType === "audio") {
      return (
        <div className="mb-1 flex items-center gap-2 rounded-lg bg-background/10 p-3">
          <Volume2 className="h-5 w-5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Áudio indisponível</span>
          <button
            onClick={tryRedownload}
            disabled={reloading}
            className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
          >
            {reloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Recarregar
          </button>
        </div>
      );
    }
    return (
      <div className="mb-1 flex items-center gap-2 rounded-lg bg-background/10 p-3">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Mídia indisponível</span>
        <button
          onClick={tryRedownload}
          disabled={reloading}
          className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
        >
          {reloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Recarregar
        </button>
      </div>
    );
  }

  if (!resolvedUrl) return null;

  if (mediaType === "image") {
    return (
      <>
        <div className="block mb-1 relative cursor-pointer" onClick={() => setLightboxOpen(true)}>
          {/* Thumbnail placeholder with blur — visible until full image loads */}
          {thumbSrc && !thumbnailLoaded && (
            <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full rounded-lg blur-sm object-cover"
              style={{ maxWidth: 280, maxHeight: 300 }} />
          )}
          <img
            src={resolvedUrl}
            alt="Imagem"
            className={cn(
              "rounded-lg cursor-pointer hover:opacity-90 transition-all duration-300",
              !thumbnailLoaded && thumbSrc ? "opacity-0" : "opacity-100"
            )}
            style={{ maxWidth: 280, maxHeight: 300, width: "auto", height: "auto" }}
            loading="lazy"
            onLoad={() => setThumbnailLoaded(true)}
            onError={handleImageError}
          />
        </div>
        {lightboxOpen && (
          <ImageLightbox src={resolvedUrl} alt="Imagem" onClose={() => setLightboxOpen(false)} />
        )}
      </>
    );
  }

  if (mediaType === "sticker") {
    return (
      <img
        src={resolvedUrl}
        alt="Sticker"
        className="mb-1 max-h-36 max-w-full rounded-lg"
        loading="lazy"
        onError={handleImageError}
      />
    );
  }

  if (mediaType === "video") {
    return (
      <video controls className="mb-1 rounded-lg" style={{ maxWidth: 280, maxHeight: 300 }} preload="metadata">
        <source src={resolvedUrl} type={metadataMimeType || undefined} />
      </video>
    );
  }

  if (mediaType === "audio") {
    return <AudioPlayer src={resolvedUrl} isOutbound={isOutbound} mimeType={metadataMimeType} />;
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
