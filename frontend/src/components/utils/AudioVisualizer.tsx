import { useState, useEffect } from "react";

export default function AudioVisualizer({
  onReady,
}: {
  onReady: (ready: boolean) => void;
}) {
  const [levels, setLevels] = useState<number[]>(Array(10).fill(0));
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let frame = 0;
    let update: (() => void) | undefined;
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) update?.();
    };
    document.addEventListener("visibilitychange", visibility);
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        context = new AudioContext();
        const analyser = context.createAnalyser();
        context.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        onReady(true);
        update = () => {
          if (disposed || document.hidden) return;
          analyser.getByteFrequencyData(data);
          const band = Math.max(1, Math.floor((data.length * 0.7) / 10));
          setLevels(
            Array.from({ length: 10 }, (_, i) => {
              let sum = 0;
              for (let j = i * band; j < (i + 1) * band; j++) sum += data[j];
              return Math.max(0.02, Math.min(1, sum / band / 255));
            }),
          );
          frame = requestAnimationFrame(updateFrame);
        };
        const updateFrame = () => update?.();
        update();
      } catch {
        stream?.getTracks().forEach((track) => track.stop());
        if (!disposed) {
          onReady(false);
          setError(
            "マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。",
          );
        }
      }
    };
    void start();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibility);
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close().catch(() => {});
    };
  }, [onReady]);
  return error ? (
    <p role="alert" className="alert">
      {error}
    </p>
  ) : (
    <div className="audio-visualizer" role="img" aria-label="マイクの音量">
      {levels.map((level, index) => (
        <span
          className="audio-bar"
          key={index}
          style={{ transform: `scaleY(${level})` }}
        />
      ))}
    </div>
  );
}
