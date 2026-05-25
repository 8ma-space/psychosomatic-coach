'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Activity } from 'lucide-react';
import { useCamera } from '@/hooks/useCamera';
import type { VisionSignals } from '@/lib/types';

interface Props {
  enabled: boolean;
  onSignals?: (signals: VisionSignals) => void;
  onToggle: (enabled: boolean) => void;
}

export function CameraFeed({ enabled, onSignals, onToggle }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [signals, setSignals] = useState<VisionSignals | null>(null);

  const handleSignals = (s: VisionSignals) => {
    setSignals(s);
    onSignals?.(s);
  };

  const { hasPermission, isAnalyzing, error, requestPermission, startAnalysis, stopCamera } =
    useCamera({ enabled, onSignals: handleSignals });

  useEffect(() => {
    if (!enabled) return;

    requestPermission().then(stream => {
      if (!stream || !videoRef.current) return;
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
      startAnalysis(videoRef.current);
    });

    return () => stopCamera();
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) {
    return (
      <div className="rounded-xl border-2 border-dashed border-stone-200 flex flex-col items-center justify-center p-6 gap-3 min-h-[200px]">
        <CameraOff className="w-8 h-8 text-stone-300" />
        <p className="text-xs text-stone-400 text-center">Camera disabled</p>
        <button
          onClick={() => onToggle(true)}
          className="text-xs text-sage-600 hover:text-sage-800 underline"
        >
          Enable camera
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden bg-stone-900 aspect-video">
        <video
          ref={videoRef}
          className="w-full h-full object-cover scale-x-[-1]"
          playsInline
          muted
        />
        {!hasPermission && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-white text-xs">Requesting camera...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-800">
            <p className="text-red-400 text-xs text-center px-4">{error}</p>
          </div>
        )}
        {isAnalyzing && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/40 rounded-full px-2 py-0.5">
            <Activity className="w-3 h-3 text-emerald-400" />
            <span className="text-xs text-white">Active</span>
          </div>
        )}
        <button
          onClick={() => onToggle(false)}
          className="absolute top-2 left-2 p-1.5 bg-black/40 hover:bg-black/60 rounded-full transition-colors"
          title="Disable camera"
        >
          <CameraOff className="w-3.5 h-3.5 text-white" />
        </button>
      </div>

      {/* Signal readout */}
      {signals && isAnalyzing && (
        <div className="grid grid-cols-2 gap-1.5">
          <SignalBar label="Breathing" value={signals.breathing_change} />
          <SignalBar label="Tension" value={signals.tension_level} warn={signals.tension_level > 0.5} />
          <SignalBar label="Engagement" value={signals.engagement} positive />
          <SignalBar label="Expression" value={signals.expression_change} />
        </div>
      )}

      <p className="text-xs text-stone-400 leading-relaxed">
        Analysis runs in your browser. No video leaves your device.
      </p>
    </div>
  );
}

function SignalBar({
  label, value, warn = false, positive = false,
}: { label: string; value: number; warn?: boolean; positive?: boolean }) {
  const pct = Math.round(value * 100);
  const color = warn && value > 0.5
    ? 'bg-orange-400'
    : positive
    ? 'bg-emerald-400'
    : 'bg-sage-400';

  return (
    <div>
      <div className="flex justify-between text-xs text-stone-500 mb-0.5">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
