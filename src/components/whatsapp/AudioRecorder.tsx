import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Send, Trash2 } from "lucide-react";

interface AudioRecorderProps {
  onSend: (base64: string, mimeType: string, duration: number) => void;
}

export function AudioRecorder({ onSend }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(new Array(30).fill(4));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    mediaRecorderRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;
    timerRef.current = null;
    animFrameRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up analyser for waveform
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Pick best supported codec
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(250);
      setRecording(true);
      setElapsed(0);

      // Timer
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 200);

      // Waveform animation
      const updateWaveform = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        // Take 30 evenly spaced samples
        const bars: number[] = [];
        const step = Math.max(1, Math.floor(data.length / 30));
        for (let i = 0; i < 30; i++) {
          const val = data[Math.min(i * step, data.length - 1)] || 0;
          bars.push(Math.max(3, (val / 255) * 28));
        }
        setWaveform(bars);
        animFrameRef.current = requestAnimationFrame(updateWaveform);
      };
      animFrameRef.current = requestAnimationFrame(updateWaveform);
    } catch {
      // Permission denied or not available
    }
  }, []);

  const stopAndSend = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    const duration = elapsed;

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1] || "";
        if (base64) onSend(base64, recorder.mimeType, duration);
      };
      reader.readAsDataURL(blob);
      cleanup();
      setRecording(false);
      setWaveform(new Array(30).fill(4));
    };

    recorder.stop();
  }, [elapsed, onSend, cleanup]);

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
    setRecording(false);
    setElapsed(0);
    setWaveform(new Array(30).fill(4));
  }, [cleanup]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (!recording) {
    return (
      <button
        type="button"
        onClick={startRecording}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        title="Gravar áudio"
      >
        <Mic className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {/* Cancel */}
      <button
        onClick={cancel}
        className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 transition-colors shrink-0"
        title="Cancelar"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {/* Recording indicator */}
      <div className="flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-destructive opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
      </div>

      {/* Timer */}
      <span className="text-xs font-mono text-destructive tabular-nums shrink-0">
        {formatElapsed(elapsed)}
      </span>

      {/* Waveform */}
      <div className="flex items-center gap-[2px] flex-1 min-w-0 h-7 overflow-hidden">
        {waveform.map((h, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-destructive/60 transition-[height] duration-75"
            style={{ height: `${h}px` }}
          />
        ))}
      </div>

      {/* Send */}
      <button
        onClick={stopAndSend}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0 active:scale-95"
        title="Enviar áudio"
      >
        <Send className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
