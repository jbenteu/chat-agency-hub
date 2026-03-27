import { memo, useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Image as ImageIcon, ImageOff, FileText, Download, Play, Pause, Volume2, VolumeX, RefreshCw } from "lucide-react";
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
  // URLs do MinIO são permanentes — fixMinioUrl remove parâmetros X-Amz-
  if (url.includes("chatwoot-evo-minio.fd6j1o.easypanel.host")) return false;
  // CDN do WhatsApp expira (~24h via parâmetros oh= / oe=)
  if (url.includes("mmg.whatsapp.net") || url.includes("media.whatsapp.net") || url.includes(".enc?")) return true;
  // URLs AWS S3 pré-assinadas (não-MinIO)
  if (url.includes("X-Amz-Expires") || url.includes("X-Amz-Credential")) return true;
  return false;
}

/** Transform internal Docker MinIO URLs to public-facing URLs and strip AWS presign params */
function fixMinioUrl(url: string): string {
  let fixed = url
    .replace(/^http:\/\/minio:9000\//, "https://chatwoot-evo-minio.fd6j1o.easypanel.host/")
    .replace(/^http:\/\/82\.25\.70\.124:9000\//, "https://chatwoot-evo-minio.fd6j1o.easypanel.host/");
  // Remove parâmetros de assinatura AWS (bucket é público no MinIO)
  if (fixed.includes("X-Amz-")) {
    try {
      const u = new URL(fixed);
      for (const key of [...u.searchParams.keys()]) {
        if (key.startsWith("X-Amz-") || key === "X-Amz-Signature") u.searchParams.delete(key);
      }
      fixed = u.toString();
    } catch { /* mantém como está */ }
  }
  return fixed;
}

// ── WhatsApp-style Audio Player ──
const SPEED_OPTIONS = [1, 1.5, 2] as const;

function AudioPlayer({ src, isOutbound, mimeType }: { src: string; isOutbound: boolean; mimeType?: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [waveform] = useState(() =>
    Array.from({ length: 32 }, () => 0.15 + Math.random() * 0.85)
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
    if (playing) { audio.pause(); } else { audio.playbackRate = speed; audio.play().catch(() => {}); }
    setPlaying(!playing);
  };

  const cycleSpeed = () => {
    const idx = SPEED_OPTIONS.indexOf(speed as typeof SPEED_OPTIONS[number]);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
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
    <div className="flex items-center gap-2.5 min-w-[240px] max-w-[300px] py-1">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={togglePlay}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all shadow-sm ${
          isOutbound
            ? "bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground"
            : "bg-primary/15 hover:bg-primary/25 text-primary"
        }`}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex flex-1 flex-col gap-1.5">
        {/* Waveform */}
        <div className="flex items-end gap-[2px] h-6 cursor-pointer" onClick={handleSeek}>
          {waveform.map((h, i) => {
            const barProgress = i / waveform.length;
            const isActive = barProgress <= progress;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-all duration-150 ${
                  isActive
                    ? isOutbound ? "bg-primary-foreground/90" : "bg-primary"
                    : isOutbound ? "bg-primary-foreground/20" : "bg-primary/20"
                }`}
                style={{ height: `${Math.max(h * 100, 12)}%` }}
              />
            );
          })}
        </div>
        {/* Time + Speed */}
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-medium tabular-nums ${
            isOutbound ? "text-primary-foreground/60" : "text-muted-foreground"
          }`}>
            {playing || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
          </span>
          <button
            onClick={cycleSpeed}
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md transition-colors ${
              isOutbound
                ? "bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground/70"
                : "bg-primary/10 hover:bg-primary/20 text-primary/70"
            }`}
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Video Player com controles customizados ──
function VideoPlayer({ src, mimeType, thumbSrc, mediaWidth, mediaHeight, onRedownload, reloading }: {
  src: string; mimeType?: string | null; thumbSrc?: string | null;
  mediaWidth?: number | null; mediaHeight?: number | null;
  onError: () => void; onRedownload: () => Promise<void>; reloading: boolean;
  isOutbound: boolean;
}) {
  const isPortrait = mediaWidth && mediaHeight && mediaHeight > mediaWidth;
  const containerMaxWidth = isPortrait ? 200 : 280;
  const containerStyle: React.CSSProperties = {
    maxWidth: containerMaxWidth,
    ...(mediaWidth && mediaHeight ? { aspectRatio: `${mediaWidth}/${mediaHeight}` } : {}),
  };
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [ctrlVisible, setCtrlVisible] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoaded = () => setDuration(isFinite(video.duration) ? video.duration : 0);
    const onTime = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) setBufferedEnd(video.buffered.end(video.buffered.length - 1));
    };
    const onEnded = () => { setPlaying(false); setCtrlVisible(true); };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setCtrlVisible(false), 2500);
  };

  const revealControls = () => {
    setCtrlVisible(true);
    if (playing) scheduleHide();
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setCtrlVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else {
      v.play().catch(() => setVideoError(true));
      scheduleHide();
    }
    setPlaying(!playing);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  };

  const handleVolumeChange = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.volume = pct;
    v.muted = pct === 0;
    setVolume(pct);
    setMuted(pct === 0);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !muted;
    setMuted(!muted);
  };

  const fmt = (t: number) => {
    if (!t || !isFinite(t)) return "0:00";
    return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const bufferedPct = duration > 0 ? bufferedEnd / duration : 0;
  const effectiveVol = muted ? 0 : volume;

  if (videoError) {
    return (
      <div className="mb-1 flex flex-col items-center gap-2 rounded-lg bg-background/10 p-4" style={{ maxWidth: 280 }}>
        {thumbSrc ? (
          <img src={thumbSrc} alt="Preview" className="max-w-full rounded-lg opacity-40 blur-sm" style={{ maxHeight: 180 }} />
        ) : (
          <Play className="h-8 w-8 text-muted-foreground" />
        )}
        <span className="text-xs text-muted-foreground text-center">
          Vídeo indisponível
        </span>
        <button
          onClick={() => { setVideoError(false); onRedownload(); }}
          disabled={reloading}
          className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {reloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {reloading ? "Buscando…" : "Tentar novamente"}
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative mb-1 overflow-hidden rounded-lg bg-black"
      style={{ maxWidth: 280 }}
      onMouseMove={revealControls}
      onTouchStart={revealControls}
    >
      <video
        ref={videoRef}
        className="block w-full"
        style={{ maxHeight: 300 }}
        preload="metadata"
        poster={thumbSrc || undefined}
        muted={muted}
        playsInline
        onClick={togglePlay}
        onError={() => setVideoError(true)}
      >
        <source src={src} type={mimeType || "video/mp4"} />
      </video>

      {/* Overlay play quando pausado */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={togglePlay}>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
            <Play className="h-6 w-6 ml-0.5" />
          </div>
        </div>
      )}

      {/* Barra de controles */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent px-2.5 pt-8 pb-2 transition-opacity duration-200",
        ctrlVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        {/* Seek bar */}
        <div
          className="relative h-[3px] w-full cursor-pointer rounded-full bg-white/25 mb-2 group"
          onClick={handleSeek}
        >
          {/* Buffered */}
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${bufferedPct * 100}%` }} />
          {/* Progress */}
          <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progress * 100}%` }} />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progress * 100}% - 6px)` }}
          />
        </div>

        {/* Linha de controles */}
        <div className="flex items-center gap-2">
          <button onClick={togglePlay} className="flex-shrink-0 text-white hover:text-white/70 transition-colors">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>

          <span className="flex-shrink-0 text-[10px] tabular-nums text-white/80">
            {fmt(currentTime)} / {fmt(duration)}
          </span>

          <div className="flex-1" />

          {/* Volume */}
          <div className="flex items-center gap-1.5">
            {showVolumeSlider && (
              <div
                className="h-[3px] w-14 cursor-pointer rounded-full bg-white/30"
                onClick={handleVolumeChange}
              >
                <div className="h-full rounded-full bg-white pointer-events-none" style={{ width: `${effectiveVol * 100}%` }} />
              </div>
            )}
            <button
              onClick={() => { toggleMute(); setShowVolumeSlider(v => !v); }}
              className="flex-shrink-0 text-white hover:text-white/70 transition-colors"
            >
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const MediaMessage = memo(function MediaMessage({ messageId, mediaUrl, mediaType, content, instanceName, remoteJid, isOutbound, mediaThumbnail, mediaWidth, mediaHeight, metadataMimeType }: MediaMessageProps) {
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

      if (data?.encryptedCdn) { setError(true); return; }

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

        // encryptedCdn = URL do CDN do WhatsApp (criptografada, não reproduzível no browser)
        if (data?.encryptedCdn) {
          setError(true);
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
    return <VideoPlayer src={resolvedUrl} mimeType={metadataMimeType} thumbSrc={thumbSrc} mediaWidth={mediaWidth} mediaHeight={mediaHeight} onError={() => { setResolvedUrl(null); setError(true); }} onRedownload={tryRedownload} reloading={reloading} isOutbound={isOutbound} />;
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
});
